<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, FlowRuntime, type WorkflowBlueprint, type WorkflowResult } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'
import { useLayout } from '~/composables/useLayout'
import { simpleExamples, simpleExamplesConfig } from '~/composables/simple-examples'
import { toGraphRepresentation } from '~/composables/useDeclarativeWorkflow'

const flow = useVueFlow('simple-examples-workflow')

const direction = ref<'TB' | 'LR'>('LR')
const selectedUseCase = ref<keyof typeof simpleExamples>('1.basic')
const isRunning = ref(false)
const executionResult = ref<WorkflowResult | null>(null)
const executionError = ref<string | null>(null)

const currentExample = computed(() => simpleExamples[selectedUseCase.value])
const currentBlueprint = computed(() => currentExample.value?.blueprint)
const graph = computed(() => toGraphRepresentation(currentBlueprint.value as WorkflowBlueprint))

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
		label: edge.label,
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

eventBus.on('node:error', (event) => {
	const { nodeId } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || { status: 'idle' as const }
	nodeData.value.set(nodeId, { ...currentData, status: 'failed' as const })
})

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
})

async function runWorkflow() {
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	currentBlueprint.value?.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		if (!currentBlueprint.value) {
			throw new Error(`Blueprint not found for example: ${selectedUseCase.value}`)
		}
		const result = await runtime.run(
			currentBlueprint.value,
			simpleExamplesConfig[selectedUseCase.value]?.initialContext || {},
			{ functionRegistry: currentExample.value?.functionRegistry },
		)
		executionResult.value = result
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
				<CardTitle>Simple Standalone Examples</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>These examples demonstrate core framework features without external APIs, using mock data and timeouts.</p>
				</div>

				<div class="space-y-2">
					<label for="useCase" class="text-sm font-medium">Select Example:</label>
					<select id="useCase" v-model="selectedUseCase" class="w-full p-2 border rounded">
						<option value="1.basic">1. Basic Sequential Flow</option>
						<option value="2.branching">2. Conditional Branching</option>
						<option value="3.parallel">3. Parallel Execution</option>
						<option value="4.error-handling">4. Error Handling & Retries</option>
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
								/>
							</template>
						</VueFlow>
					</ClientOnly>
				</div>

				<div v-if="executionResult" class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
					<h3 class="font-bold text-green-800 dark:text-green-200">
						Execution Result:
					</h3>
					<pre class="whitespace-pre-wrap">{{ JSON.stringify(executionResult, null, 2) }}</pre>
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
