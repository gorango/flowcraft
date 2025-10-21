<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'

interface TranslationContext {
	'text': string
	'languages': string[]
	'output_dir': string
	'prepare-jobs': { language: string, text: string }[]
	'translations': { language: string, translation: string }[]
}

async function prepareJobs(ctx: any) {
	const languages = await ctx.context.get('languages')
	const text = await ctx.context.get('text')
	if (!languages || !text) {
		throw new TypeError('languages and text are required')
	}
	const jobs = languages.map((language: string) => ({ language, text }))
	await ctx.context.set('prepare-jobs', jobs)
	return { output: jobs }
}

async function translateItem(ctx: any) {
	const input = ctx.input as { language: string, text: string }
	if (!input) {
		throw new Error('Input is required for translation worker')
	}
	const { language, text } = input
	const prompt = `
Translate the following markdown text into ${language}.
Preserve markdown formatting, links, and code blocks.
Return only the translated text.

Original Text:
${text}`

	console.log(`Translating to ${language}...`)
	const translation = await callLLM(prompt)
	console.log(`✓ Finished ${language}`)
	return { output: { language, translation } }
}

async function collectResults(ctx: any) {
	const translations = await ctx.context.get('translations')
	if (!translations || translations.length === 0) {
		console.warn('No translations to collect.')
		return { output: 'Collected 0 translations.' }
	}
	return { output: `Collected ${translations.length} translations.` }
}

async function callLLM(prompt: string): Promise<string> {
	try {
		const { response } = await $fetch('/api/llm', {
			method: 'POST',
			body: { prompt },
		})
		return response
	}
	catch (error: any) {
		console.error('Error calling LLM:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

const flow = useVueFlow('translate-workflow')
const { layout } = useLayout()

/** Pre-processes a UI graph to replace a batch placeholder with static worker nodes. */
function createInitialUIGraph(baseGraph: { nodes: any[], edges: any[] }, languages: string[]) {
	const nodes = [...baseGraph.nodes]
	const edges = [...baseGraph.edges]

	const placeholderIndex = nodes.findIndex(n => n.data?.isBatchPlaceholder)
	if (placeholderIndex === -1) {
		return { nodes, edges }
	}

	const placeholderNode = nodes[placeholderIndex]
	const batchId = placeholderNode.id

	const predecessors = edges.filter(e => e.target === batchId).map(e => e.source)
	const successors = edges.filter(e => e.source === batchId).map(e => e.target)

	nodes.splice(placeholderIndex, 1)
	const defaultNodes = nodes.map(node => ({
		id: node.id,
		position: { x: 0, y: 0 },
		data: { label: node.id.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) },
	}))
	const workerNodes = languages.map(lang => ({
		id: `${batchId}-worker-${lang.toLowerCase()}`,
		position: { ...placeholderNode.position },
		data: { label: `Translate to ${lang}` },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	}))

	const remainingEdges = edges.filter(e => e.target !== batchId && e.source !== batchId)

	const newEdges: Edge[] = []
	for (const predecessor of predecessors) {
		for (const worker of workerNodes) {
			newEdges.push({
				id: `${predecessor}->${worker.id}`,
				source: predecessor,
				target: worker.id,
				// type: 'smoothstep',
			})
		}
	}
	for (const successor of successors) {
		for (const worker of workerNodes) {
			newEdges.push({
				id: `${worker.id}->${successor}`,
				source: worker.id,
				target: successor,
				// type: 'smoothstep',
			})
		}
	}

	return {
		nodes: [...defaultNodes, ...workerNodes],
		edges: [...remainingEdges, ...newEdges],
	}
}

const greetingFlow = createFlow<TranslationContext>('parallel-translation')
	.node('prepare-jobs', prepareJobs)
	.node('collect-results', collectResults, { inputs: 'translations' })
	.batch('translate-batch', translateItem, {
		inputKey: 'prepare-jobs',
		outputKey: 'translations',
	})
	.edge('prepare-jobs', 'translate-batch_scatter')
	.edge('translate-batch_gather', 'collect-results')

const languages = ref([
	'Spanish',
	'German',
	'French',
])
const text = ref('Hello world! This is a test document.')
const newLanguage = ref('')

const baseUIGraph = greetingFlow.toGraphRepresentation()
const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()

const initialGraph = createInitialUIGraph(baseUIGraph, languages.value)

const initialNodes = ref<Node[]>(layout(
	initialGraph.nodes.map(node => ({ ...node, position: { x: 0, y: 0 } })),
	initialGraph.edges,
	'LR',
))

const initialEdges = ref<Edge[]>(initialGraph.edges.map((edge, index) => ({
	id: edge.id || `edge-${index}`,
	source: edge.source,
	target: edge.target,
	// type: 'smoothstep',
	// animated: true,
})))

flow.setNodes(initialNodes.value)
flow.setEdges(initialEdges.value)

const { eventBus } = useEventBus()
const nodeData = ref(new Map<string, any>())
const runtimeToUINodeMap = ref(new Map<string, string>())

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

eventBus.on('batch:start', (event) => {
	const { batchId, workerNodeIds } = event.payload as any
	workerNodeIds.forEach((runtimeId: string, index: number) => {
		const lang = languages.value[index]
		if (lang) {
			const staticId = `${batchId}-worker-${lang.toLowerCase()}`
			runtimeToUINodeMap.value.set(runtimeId, staticId)
		}
	})
})

eventBus.on('node:start', (event) => {
	const { nodeId, input } = event.payload as any
	const uiNodeId = runtimeToUINodeMap.value.get(nodeId) || nodeId
	nodeData.value.set(uiNodeId, { ...nodeData.value.get(uiNodeId), status: 'pending', inputs: input })
})

eventBus.on('node:finish', (event) => {
	const { nodeId, result } = event.payload as any
	const uiNodeId = runtimeToUINodeMap.value.get(nodeId) || nodeId
	nodeData.value.set(uiNodeId, { ...nodeData.value.get(uiNodeId), status: 'completed', outputs: result.output })
})

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
})

const isRunning = ref(false)
const executionResult = ref<unknown>(null)
const executionError = ref<string | null>(null)

async function runWorkflow() {
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	runtimeToUINodeMap.value.clear()

	initialNodes.value.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})

	try {
		const result = await runtime.run(blueprint, {
			text: text.value,
			languages: languages.value,
			output_dir: '/tmp',
		}, { functionRegistry })
		executionResult.value = result
	}
	catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error running workflow:', error)
	}
	finally {
		isRunning.value = false
	}
}

async function addLanguage() {
	if (newLanguage.value && !languages.value.includes(newLanguage.value)) {
		languages.value.push(newLanguage.value)
		newLanguage.value = ''
		updateGraph()
	}
}

function removeLanguage(lang: string) {
	languages.value = languages.value.filter(l => l !== lang)
	updateGraph()
}

function updateGraph() {
	const newGraph = createInitialUIGraph(baseUIGraph, languages.value)
	initialNodes.value = layout(
		newGraph.nodes.map(node => ({ ...node, position: { x: 0, y: 0 } })),
		newGraph.edges,
		'LR',
	)
	initialEdges.value = newGraph.edges.map((edge, index) => ({
		id: edge.id || `edge-${index}`,
		source: edge.source,
		target: edge.target,
		// type: 'smoothstep',
	}))
	flow.setNodes(initialNodes.value)
	flow.setEdges(initialEdges.value)
	// eslint-disable-next-line no-new
	new Promise(resolve => setTimeout(() => {
		flow.fitView()
		resolve(true)
	}, 100))
}

function clearWorkflow() {
	executionResult.value = null
	executionError.value = null
	nodeData.value.clear()
	runtimeToUINodeMap.value.clear()
	initialNodes.value.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
}
</script>

<template>
	<div class="mx-auto max-w-6xl p-4">
		<Card>
			<CardHeader>
				<CardTitle>Translate Workflow Example</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>This workflow demonstrates parallel translation:</p>
					<ol class="list-decimal list-inside mt-2">
						<li><strong>Prepare Jobs:</strong> Prepares translation jobs for each language.</li>
						<li><strong>Translate Batch:</strong> Translates text into multiple languages in parallel.</li>
						<li><strong>Collect Results:</strong> Collects all translations.</li>
					</ol>
				</div>

				<ClientOnly>
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium mb-2">Text to Translate</label>
							<Textarea v-model="text" placeholder="Enter text to translate" class="min-h-[100px]" />
						</div>

						<div>
							<label class="block text-sm font-medium mb-2">Languages</label>
							<div class="flex flex-wrap gap-2 mb-2">
								<span v-for="lang in languages" :key="lang" class="inline-flex items-center px-2 py-1 bg-primary text-primary-foreground rounded">
									{{ lang }}
									<Button variant="ghost" size="sm" class="ml-1 h-4 w-4 p-0" @click="removeLanguage(lang)">
										&times;
									</Button>
								</span>
							</div>
							<div class="flex gap-2">
								<Input v-model="newLanguage" placeholder="Add language" @keyup.enter="addLanguage" />
								<Button @click="addLanguage">
									Add
								</Button>
							</div>
						</div>
					</div>

					<div class="flex gap-2">
						<Button :disabled="isRunning" @click="runWorkflow">
							{{ isRunning ? 'Running...' : 'Run Workflow' }}
						</Button>
						<Button variant="outline" @click="clearWorkflow">
							Clear Results
						</Button>
					</div>
				</ClientOnly>

				<div class="h-full border rounded-lg aspect-square md:aspect-video">
					<ClientOnly>
						<VueFlow
							id="translate-workflow"
							class="flow"
							:fit-view-on-init="true"
						>
							<Background />
							<template #node-default="nodeProps">
								<FlowNodeGeneric
									v-bind="nodeProps"
									direction="LR"
									:node-data="getNodeData(nodeProps.id)"
								/>
							</template>
						</VueFlow>
					</ClientOnly>
				</div>

				<div v-if="executionError" class="p-4 bg-destructive text-destructive-foreground rounded-lg">
					<h3 class="font-bold">
						Execution Error:
					</h3>
					<p>{{ executionError }}</p>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
