<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'

interface ResearchAgentContext {
	question: string
	search_context: string
	loop_count: number
	current_query?: string
	last_action?: string
	answer?: string
}

const flow = useVueFlow('research-workflow')

async function initialize(ctx: any) {
	await ctx.context.set('search_context', '')
	await ctx.context.set('loop_count', 0)
	await ctx.context.set('last_action', undefined)
	return { output: 'Initialized' }
}

async function decide(ctx: any) {
	const { question, search_context, loop_count } = await ctx.context.toJSON()
	const prompt = `Based on the question and context, decide whether to 'search' or 'answer'. Respond in JSON format with 'action' (search or answer) and 'reason'. If action is 'search', include 'search_query'.

Question: ${question}
Context: ${search_context}
Searches count: ${loop_count}

JSON Response:`
	const response = await callLLM(prompt, `Today's date is ${new Date().toISOString()}.`)
	const decision = JSON.parse(
		response
			.replace(/^```json\n/, '')
			.replace(/\n```$/, '')
			.trim(),
	)
	await ctx.context.set('current_query', decision.search_query)
	await ctx.context.set('last_action', decision.action)
	return { action: decision.action, output: decision }
}

async function search(ctx: any) {
	const query = await ctx.context.get('current_query')
	if (!query) {
		throw new Error('current_query is required for search')
	}
	const results = await searchWeb(query)
	const current_context = (await ctx.context.get('search_context')) || ''
	await ctx.context.set('search_context', `${current_context}\n${results}`)
	const currentLoopCount = (await ctx.context.get('loop_count')) || 0
	await ctx.context.set('loop_count', currentLoopCount + 1)
	return { output: results }
}

async function answer(ctx: any) {
	const { question, search_context } = await ctx.context.toJSON()
	const prompt = `Answer the question based on the context. Q: ${question}, C: ${search_context}`
	const finalAnswer = await callLLM(prompt)
	await ctx.context.set('answer', finalAnswer)
	return { output: finalAnswer }
}

async function callLLM(prompt: string, systemMessage?: string): Promise<string> {
	try {
		const { response } = await $fetch('/api/llm', {
			method: 'POST',
			body: { prompt, systemMessage },
		})
		return response
	}
	catch (error: any) {
		console.error('Error calling LLM:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

async function searchWeb(query: string): Promise<string> {
	try {
		const { results } = await $fetch('/api/search', {
			method: 'POST',
			body: { query },
		})
		return results
	}
	catch (error: any) {
		console.error('Error calling search:', error)
		return `Error: Could not fetch search results. ${error.message}`
	}
}

const greetingFlow = createFlow<ResearchAgentContext>('research-agent')
	.node('initialize', initialize)
	.node('decide', decide, { config: { joinStrategy: 'any' } })
	.node('search', search)
	.node('answer', answer)
	.loop('research', {
		startNodeId: 'decide',
		endNodeId: 'search',
		condition: 'loop_count < 2 && last_action !== \'answer\'',
	})
	.edge('research-loop', 'answer', { action: 'break' })
	.edge('initialize', 'decide')
	.edge('decide', 'search', { action: 'search' })
	.edge('decide', 'answer', { action: 'answer' })
	.edge('search', 'decide')

const uiGraph = greetingFlow.toGraphRepresentation()
const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()

console.log({ blueprint, graph: uiGraph })

const postions = {
	initialize: { x: 0, y: 200 },
	decide: { x: 256 + 150, y: 50 },
	search: { x: 256 + 150, y: 350 },
	answer: { x: 256 * 2 + 150 * 2, y: 200 },
}

const vueFlowNodes: Node[] = uiGraph.nodes.map((node, index) => ({
	id: node.id,
	position: postions[node.id],
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
	targetPosition: Position.Left,
	sourcePosition: Position.Right,
}))

const vueFlowEdges: Edge[] = uiGraph.edges.map((edge, index) => ({
	id: `edge-${index}`,
	source: edge.source,
	target: edge.target,
	// type: 'smoothstep',
	pathOptions: { curvature: 0.35 },
	animated: true,
}))

flow.setNodes(vueFlowNodes)
flow.setEdges(vueFlowEdges)

const nodes = ref(flow.nodes.value)
const edges = ref(flow.edges.value)

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
	evaluator: new UnsafeEvaluator(),
})

const isRunning = ref(false)
const executionResult = ref<unknown>(null)
const executionError = ref<string | null>(null)
const question = ref('Who won the Nobel Prize in Physics 2024?')

async function runWorkflow() {
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		const result = await runtime.run(blueprint, { question: question.value }, { functionRegistry })
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
				<CardTitle>Research Agent Workflow Example</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>This workflow demonstrates an AI research agent:</p>
					<ol class="list-decimal list-inside mt-2">
						<li><strong>Initialize:</strong> Sets up initial state.</li>
						<li><strong>Decide:</strong> Decides whether to search or answer based on context.</li>
						<li><strong>Search:</strong> Performs web search if needed.</li>
						<li><strong>Answer:</strong> Provides final answer after gathering information.</li>
					</ol>
					<p class="mt-2">
						The agent loops between decide and search up to 2 times or until it decides to answer.
					</p>
				</div>

				<div class="space-y-2">
					<label for="question" class="text-sm font-medium">Research Question:</label>
					<Input id="question" v-model="question" placeholder="Enter your research question..." />
				</div>

				<div class="flex gap-2">
					<Button :disabled="isRunning" @click="runWorkflow">
						{{ isRunning ? 'Running...' : 'Run Research' }}
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
							<template #node-default="nodeProps">
								<FlowNodeGeneric
									v-bind="nodeProps"
									:node-data="getNodeData(nodeProps.id)"
								/>
							</template>
						</VueFlow>
					</ClientOnly>
				</div>

				<div v-if="executionResult" class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
					<h3 class="font-bold text-green-800 dark:text-green-200">
						Final Answer:
					</h3>
					<p class="text-green-700">
						{{ executionResult.context?.answer }}
					</p>
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
