<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'
import { useLayout } from '~/composables/useLayout'
import { agentNodeRegistry, blueprints, config, toGraphRepresentation, processBlueprint } from '~/composables/useDeclarativeWorkflow'

const flow = useVueFlow('declarative-workflow')

const direction = ref<'TB' | 'LR'>('LR')
const selectedUseCase = ref<keyof typeof config>('1.blog-post')
const isRunning = ref(false)
const executionResult = ref<unknown>(null)
const executionError = ref<string | null>(null)

const currentBlueprint = computed(() => {
	const blueprintId = config[selectedUseCase.value].entryWorkflowId
	const blueprint = blueprints[blueprintId]
	return blueprint ? processBlueprint(blueprint) : null
})
const graph = computed(() => toGraphRepresentation(currentBlueprint.value))

const vueFlowNodes = computed<Node[]>(() =>
	graph.value.nodes.map((node, index) => ({
		id: node.id,
		position: { x: 1 + index * (256 + 48), y: 100 },
		data: { label: node.data.label },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	}))
)

const vueFlowEdges = computed<Edge[]>(() =>
	graph.value.edges.map((edge, index) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		// type: 'smoothstep',
		animated: true,
	}))
)

const nodes = computed(() => flow.nodes.value)
const edges = computed(() => flow.edges.value)

const { layout } = useLayout()

onMounted(() => {
	flow.setNodes(layout(vueFlowNodes.value, vueFlowEdges.value, direction.value))
	flow.setEdges(vueFlowEdges.value)
})

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
	registry: agentNodeRegistry,
	blueprints,
})

async function runWorkflow() {
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	currentBlueprint.value.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		if (!currentBlueprint.value) {
			throw new Error(`Blueprint not found for use case: ${selectedUseCase.value}`)
		}
		const result = await runtime.run(currentBlueprint.value, config[selectedUseCase.value].initialContext)
		executionResult.value = result
		console.log(executionResult.value.context)
	} catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error running workflow:', error)
	} finally {
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

watch(selectedUseCase, async () => {
	flow.setNodes(layout(vueFlowNodes.value, vueFlowEdges.value, direction.value))
	flow.setEdges(vueFlowEdges.value)
	clearWorkflow()
	await new Promise(r => setTimeout(r))
	flow.fitView()
})
</script>

<template>
	<div class="mx-auto max-w-6xl p-4">
		<Card>
			<CardHeader>
				<CardTitle>Declarative Workflow Example</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>This page demonstrates declarative workflows using blueprints:</p>
					<ol class="list-decimal list-inside mt-2">
						<li><strong>Select Use Case:</strong> Choose from predefined scenarios like blog post generation or content moderation.</li>
						<li><strong>Run Workflow:</strong> Execute the workflow and view real-time progress.</li>
						<li><strong>View Results:</strong> See the final output and context state.</li>
					</ol>
				</div>

				<div class="space-y-2">
					<label for="useCase" class="text-sm font-medium">Select Use Case:</label>
					<select id="useCase" v-model="selectedUseCase" class="w-full p-2 border rounded">
						<option value="1.blog-post">1. Blog Post Generation</option>
						<option value="2.job-application">2. Job Application Processing</option>
						<option value="3.customer-review">3. Customer Review Handling</option>
						<option value="4.content-moderation">4. Content Moderation</option>
					</select>
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
							:nodes-connectable="false"
							:min-zoom="0.3"
						>
							<Background />
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

				<div v-if="executionResult" class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
					<h3 class="font-bold text-green-800 dark:text-green-200">
						Final Output:
					</h3>
					<p class="text-green-700 whitespace-pre-wrap">
						{{ executionResult.context?.final_output }}
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
