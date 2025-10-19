<script setup lang="ts">
import type { Edge, GraphEdge, GraphNode, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'

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

/**
 * Pre-processes a UI graph to replace a batch placeholder with static worker nodes.
 * @param baseGraph The graph from toGraphRepresentation.
 * @param languages The static array of languages to generate nodes for.
 */
function createInitialUIGraph(baseGraph: { nodes: any[], edges: any[] }, languages: string[]) {
	const nodes = [...baseGraph.nodes]
	const edges = [...baseGraph.edges]

	const placeholderIndex = nodes.findIndex(n => n.data?.isBatchPlaceholder)
	if (placeholderIndex === -1) {
		return { nodes, edges }
	}

	const placeholderNode = nodes[placeholderIndex]
	const batchId = placeholderNode.id

	const incomingEdges = edges.filter(e => e.target === batchId)
	const outgoingEdges = edges.filter(e => e.source === batchId)
	const predecessors = incomingEdges.map(e => e.source)
	const successors = outgoingEdges.map(e => e.target)

	nodes.splice(placeholderIndex, 1)
	const remainingEdges = edges.filter(e => e.target !== batchId && e.source !== batchId)

	const workerNodes = languages.map((lang) => {
		return {
			id: `${batchId}-worker-${lang.toLowerCase()}`,
			position: { ...placeholderNode.position },
			data: { label: `Translate to ${lang}` },
		}
	})

	const newEdges: Edge[] = []
	predecessors.forEach(p => workerNodes.forEach(w => newEdges.push({
		id: `${p}->${w.id}`,
		source: p,
		target: w.id,
		// type: 'smoothstep'
	})))
	successors.forEach(s => workerNodes.forEach(w => newEdges.push({
		id: `${w.id}->${s}`,
		source: w.id,
		target: s,
		// type: 'smoothstep'
	})))

	return {
		nodes: [...nodes.map((node, index) => ({
			id: node.id,
			position: { x: 1 + index * (256 + 48), y: 100 },
			data: { label: node.id.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) },
			targetPosition: Position.Left,
			sourcePosition: Position.Right,
		})), ...workerNodes],
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

const LANGUAGES = [
	'Spanish',
	'German',
	'French',
]
const TEXT = 'Hello world! This is a test document.'

const baseUIGraph = greetingFlow.toGraphRepresentation()
const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()

const initialGraph = createInitialUIGraph(baseUIGraph, LANGUAGES)

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
})))

flow.setNodes(initialNodes.value)
flow.setEdges(initialEdges.value)

const { eventBus } = useEventBus()
const nodeData = ref(new Map<string, any>())
const runtimeToUINodeMap = ref(new Map<string, string>())

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

function getNodeStatus(nodeId: string) {
	return getNodeData(nodeId).status || 'idle'
}

eventBus.on('batch:start', (event) => {
	const { batchId, workerNodeIds } = event.payload as any
	workerNodeIds.forEach((runtimeId: string, index: number) => {
		const lang = LANGUAGES[index]
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
			text: TEXT,
			languages: LANGUAGES,
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

async function clearWorkflow() {
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

				<div class="flex gap-2">
					<Button :disabled="isRunning" @click="runWorkflow">
						{{ isRunning ? 'Running...' : 'Run Workflow' }}
					</Button>
					<Button variant="outline" @click="clearWorkflow">
						Clear Results
					</Button>
				</div>

				<div class="h-full border rounded-lg aspect-square md:aspect-video">
					<ClientOnly>
						<!-- The v-model binding will now correctly handle dynamic updates -->
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
									:inputs="getNodeData(nodeProps.id).inputs"
									:outputs="getNodeData(nodeProps.id).outputs"
									:status="getNodeStatus(nodeProps.id)"
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
