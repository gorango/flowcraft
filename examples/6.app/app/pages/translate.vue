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

// 1. Prepare the list of translation jobs
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

// 2. This function will be executed FOR EACH item in the batch
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

// 3. This node runs AFTER the entire batch is complete
async function collectResults(ctx: any) {
	const translations = await ctx.context.get('translations')
	if (!translations || translations.length === 0) {
		console.warn('No translations to collect.')
		return { output: 'Collected 0 translations.' }
	}
	return { output: `Collected ${translations.length} translations.` }
}

// LLM call using server endpoint
async function callLLM(prompt: string): Promise<string> {
	try {
		const { translation } = await $fetch('/api/llm', {
			method: 'POST',
			body: { prompt },
		})
		return translation
	}
	catch (error: any) {
		console.error('Error calling LLM:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

const flow = useVueFlow('translate-workflow')

const greetingFlow = createFlow<TranslationContext>('parallel-translation')
	.node('prepare-jobs', prepareJobs)
	.node('collect-results', collectResults, { inputs: 'translations' })
	.batch('translate-batch', translateItem, {
		inputKey: 'prepare-jobs',
		outputKey: 'translations',
	})
	.edge('prepare-jobs', 'translate-batch_scatter')
	.edge('translate-batch_gather', 'collect-results')

const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()
const languages = ['Spanish', 'German']

console.log(blueprint)

const vueFlowNodes: Node[] = blueprint.nodes.map((node, index) => ({
	id: node.id,
	position: { x: 1 + index * (256 + 48), y: 1 + index * (128 + 48) },
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
}))

const vueFlowEdges: Edge[] = blueprint.edges.map((edge, index) => ({
	id: `edge-${index}`,
	source: edge.source,
	target: edge.target,
	type: 'smoothstep',
}))

const { layout } = useLayout()

flow.setNodes(layout(vueFlowNodes, vueFlowEdges, 'LR'))
flow.setEdges(vueFlowEdges)

const nodes = ref(flow.nodes.value)
const edges = ref(flow.edges.value)

onMounted(async () => {
	// await new Promise(r => setTimeout(r))
	// await nextTick()
	// layoutGraph()
})

const direction = ref<'TB' | 'LR'>('LR')

async function layoutGraph(d?: 'TB' | 'LR') {
	if (d)
		direction.value = d

	if (!nodes.value || !edges.value)
		return

	const newNodes = layout(nodes.value, edges.value, direction.value)
	console.log({ newNodes })
	if (newNodes) {
		nodes.value = newNodes
	}
	await new Promise(r => setTimeout(r))
	flow.fitView()
}

const { eventBus } = useEventBus()

const nodeData = ref(new Map<string, { inputs?: any, outputs?: any, contextChanges?: Record<string, any>, status?: 'idle' | 'pending' | 'completed' | 'failed' }>())

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

function getNodeStatus(nodeId: string) {
	const data = getNodeData(nodeId)
	return data.status || 'idle'
}

eventBus.on('node:start', (event) => {
	const { nodeId, input } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || { status: 'idle' as const }
	nodeData.value.set(nodeId, { ...currentData, status: 'pending' as const, inputs: input })
})

eventBus.on('node:finish', (event) => {
	// layoutGraph()
	const { nodeId, result } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || { status: 'idle' as const }
	nodeData.value.set(nodeId, { ...currentData, status: 'completed' as const, outputs: result.output })
})

eventBus.on('context:change', (event) => {
	const { sourceNode, key, value } = event.payload as any
	const currentData = nodeData.value.get(sourceNode) || { contextChanges: {} }
	const updatedContextChanges = { ...currentData.contextChanges, [key]: value }
	nodeData.value.set(sourceNode, { ...currentData, contextChanges: updatedContextChanges })
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
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		const text = 'Hello world! This is a test document.'
		const result = await runtime.run(blueprint, { text, languages, output_dir: '/tmp' }, { functionRegistry })
		executionResult.value = result
	}
	catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error running workflow:', error)
	}
	finally {
		isRunning.value = false
		await new Promise(r => setTimeout(r))
	}
}

async function clearWorkflow() {
	executionResult.value = null
	executionError.value = null
	nodeData.value.clear()
	await new Promise(r => setTimeout(r))
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
						<VueFlow
							class="flow"
							:nodes="nodes"
							:edges="edges"
							:fit-view-on-init="true"
						>
							<Background />
							<!-- <div class="absolute top-0 right-0 z-10 flex gap-2 p-2">
								<Button size="icon" @click="layoutGraph('TB')">
									<Icon name="lucide:arrow-up-down" />
								</Button>
								<Button size="icon" @click="layoutGraph('LR')">
									<Icon name="lucide:arrow-left-right" />
								</Button>
							</div> -->
							<template #node-default="nodeProps">
								<FlowNodeGeneric
									v-bind="nodeProps"
									:direction
									:node-data="getNodeData(nodeProps.id)"
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

