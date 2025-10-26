<script setup lang="ts">
import { Background } from '@vue-flow/background'
import type { Edge, Node } from '@vue-flow/core'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import type { Flow, NodeRegistry, UIGraph, WorkflowBlueprint } from 'flowcraft'
import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import { useEventBus } from '../composables/event-bus'
import { createStepper } from 'flowcraft/testing'

export type NodeDataStatus = 'idle' | 'pending' | 'completed' | 'failed'

const props = defineProps<{
	flow?: Flow<any, Record<string, any>>
	blueprint?: WorkflowBlueprint
	registry?: NodeRegistry
	positionsMap: Record<string, { x: number; y: number }>
	typesMap: Record<string, 'input' | 'default' | 'output'>
}>()

const direction = ref<'TB' | 'LR'>('LR')
const flow = useVueFlow()
const { eventBus } = useEventBus()

const uiGraph = (props.blueprint || props.flow?.toGraphRepresentation()) as UIGraph
const blueprint = (props.blueprint || props.flow?.toBlueprint()) as WorkflowBlueprint
const functionRegistry = props.flow?.getFunctionRegistry() || new Map()

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
	evaluator: new UnsafeEvaluator(),
	...(props.registry ? { registry: props.registry } : {}),
})

const stepper = await createStepper(
	runtime,
	blueprint,
	functionRegistry,
)

const vueFlowNodes: Node[] = uiGraph.nodes.map((node) => ({
	id: node.id,
	position: props.positionsMap[node.id] || { x: 0, y: 0 },
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
	type: props.typesMap[node.id],
	targetPosition: Position.Left,
	sourcePosition: Position.Right,
}))

const vueFlowEdges: Edge[] = uiGraph.edges.map((edge, index) => ({
	id: `edge-${index}`,
	source: edge.source,
	target: edge.target,
	label: edge.action,
	// type: 'smoothstep',
	animated: true,
	...(edge.data?.isLoopback
		? {
			type: 'loopback',
			data: { pathType: 'bezier' }
		}
		: {}
	),
}))

onMounted(() => {
	flow.setNodes(vueFlowNodes)
	flow.setEdges(vueFlowEdges)
})

const viewContext = ref(false)
const executionResult = ref<any>(null)
const awaitingNodes = ref<string[]>([])
const nodeData = ref(new Map<string, {
	inputs?: any,
	outputs?: any,
	contextChanges?: Record<string, any>,
	status?: NodeDataStatus
}>())

eventBus.on('node:start', (event) => {
	const { nodeId, input } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || {}
	nodeData.value.set(nodeId, { ...currentData, status: 'pending' as const, inputs: input })
})

eventBus.on('node:finish', (event) => {
	const { nodeId, result } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || {}
	nodeData.value.set(nodeId, { ...currentData, status: 'completed' as const, outputs: result.output })
})

eventBus.on('context:change', (event) => {
	const { sourceNode, key, value } = event.payload as any
	const currentData = nodeData.value.get(sourceNode) || { contextChanges: {} }
	const updatedContextChanges = { ...currentData.contextChanges, [key]: value }
	nodeData.value.set(sourceNode, { ...currentData, contextChanges: updatedContextChanges, status: 'completed' })
	awaitingNodes.value = awaitingNodes.value.filter((id: string) => id !== sourceNode)
})

eventBus.on('batch:start', (event) => {
	const { batchId } = event.payload as any
	const currentData = nodeData.value.get(batchId) || { status: 'idle' }
	nodeData.value.set(batchId, { ...currentData, status: 'pending' })
})

eventBus.on('batch:finish', (event) => {
	const { batchId, results } = event.payload as any
	const currentData = nodeData.value.get(batchId) || { status: 'idle' }
	nodeData.value.set(batchId, { ...currentData, status: 'completed', outputs: results })
})

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

function syncUiWithStepperState() {
	const newMap = new Map<string, any>()
	const completedNodes = stepper.state.getCompletedNodes()
	const context = stepper.state.getContext()

	context.toJSON().then(contextJSON => {
		executionResult.value = Object.keys(contextJSON).length > 0 ? contextJSON : null
		blueprint.nodes.forEach(node => {
			const data: {
				inputs?: any,
				outputs?: any,
				contextChanges?: Record<string, any>,
				status?: NodeDataStatus
			} = { status: 'idle' }

			if (completedNodes.has(node.id)) {
				data.status = 'completed'
				data.outputs = contextJSON[`_outputs.${node.id}`]
			}
			newMap.set(node.id, data)
		})

		const frontierIds = (stepper.traverser as any).frontier as Set<string>
		frontierIds.forEach(nodeId => {
			const currentData = newMap.get(nodeId) || {}
			newMap.set(nodeId, { ...currentData, status: 'idle' })
		})

		nodeData.value = newMap
	})
}

async function next() {
	try {
		const result = await stepper.next()
		if (result) syncUiWithStepperState()
	} finally {
	}
}

async function prev() {
	const result = await stepper.prev()
	if (result) {
		syncUiWithStepperState()
	} else {
		await clear()
	}
}

async function clear() {
	stepper.reset()
	syncUiWithStepperState()
}
</script>

<template>
	<div class="relative flex flex-col h-full rounded-[8px] overflow-hidden">
		<header class="flex items-center gap-2 p-2 bg-[var(--vp-c-bg-alt)] border-b border-[var(--vp-c-divider)]">
			<button @click="prev" class="brand" :disabled="!executionResult">
				Prev
			</button>
			<button @click="next" class="brand">
				Next
			</button>
			<!-- <button :disabled="!executionResult" @click="clear" class="alt">
				Clear
			</button> -->
			<div v-if="awaitingNodes.length > 0" class="flex items-center gap-2">
				<span class="border-l border-[var(--vp-c-divider)] h-4 mx-4" />
				<span class="text-sm font-medium">Resume:</span>
				<button v-for="nodeId in awaitingNodes" :key="nodeId" @click="resumeWorkflow(nodeId, { output: { approved: true } })" class="brand">
					Approve
				</button>
				<button v-for="nodeId in awaitingNodes" :key="nodeId" @click="resumeWorkflow(nodeId, { output: { approved: false } })" class="brand">
					Deny
				</button>
			</div>
			<span class="flex-auto" />
			<button @click="viewContext = !viewContext" v-if="executionResult" class="alt">
				<template v-if="viewContext">Hide State</template>
				<template v-else>View State</template>
			</button>
		</header>
		<pre
			v-show="viewContext"
			class="absolute inset-0 top-[45px] z-10 overflow-auto p-4 text-sm flex-auto bg-[var(--vp-code-block-bg)]"
		>{{ JSON.stringify(executionResult, null, 2) }}</pre>
		<VueFlow
			fit-view-on-init
			:max-zoom="1.25"
		>
			<Background />
			<template #node-input="nodeProps">
				<NodeInput v-bind="nodeProps" :node-data="getNodeData(nodeProps.id)" :direction />
			</template>
			<template #node-default="nodeProps">
				<NodeDefault v-bind="nodeProps" :node-data="getNodeData(nodeProps.id)" :direction />
			</template>
			<template #node-output="nodeProps">
				<NodeOutput v-bind="nodeProps" :node-data="getNodeData(nodeProps.id)" :direction />
			</template>
			<template #edge-loopback="edgeProps">
				<EdgeLoopback v-bind="edgeProps" />
			</template>
		</VueFlow>
	</div>
</template>
