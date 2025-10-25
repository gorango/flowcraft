<script setup lang="ts">
import { Background } from '@vue-flow/background'
import type { Edge, Node } from '@vue-flow/core'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import type { Flow } from 'flowcraft'
import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import { onMounted, provide, ref } from 'vue'
import { useEventBus } from '../../composables/event-bus'
import { useLayout } from '../../composables/layout'
import NodeDefault from './Node/Default.vue'
import NodeInput from './Node/Input.vue'
import NodeOutput from './Node/Output.vue'

export type NodeDataStatus = 'idle' | 'pending' | 'completed' | 'failed'

const props = defineProps<{
	flow: Flow<any, Record<string, any>>
	positionsMap: Record<string, { x: number; y: number }>
	typesMap: Record<string, 'input' | 'default' | 'output'>
}>()

const direction = ref<'TB' | 'LR'>('LR')
const flow = useVueFlow()
const { eventBus } = useEventBus()
const { layout } = useLayout()

provide('flow', flow)

const blueprint = props.flow.toBlueprint()
const functionRegistry = props.flow.getFunctionRegistry()

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
	evaluator: new UnsafeEvaluator(),
})

const vueFlowNodes: Node[] = blueprint.nodes.map((node) => ({
	id: node.id,
	position: props.positionsMap[node.id],
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
	type: props.typesMap[node.id],
	targetPosition: Position.Left,
	sourcePosition: Position.Right,
}))

const vueFlowEdges: Edge[] = blueprint.edges.map((edge, index) => ({
	id: `edge-${index}`,
	source: edge.source,
	target: edge.target,
	label: edge.action,
	// type: 'smoothstep',
	animated: true,
}))

onMounted(() => {
	flow.setNodes(vueFlowNodes)
	flow.setEdges(vueFlowEdges)
})

const isRunning = ref(false)
const viewContext = ref(false)
const executionResult = ref<any>(null)
const executionError = ref<string | null>(null)
const awaitingNodes = ref<string[]>([])
const serializedContext = ref<string | null>(null)
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
	awaitingNodes.value = awaitingNodes.value.filter((id) => id !== sourceNode)
})

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

async function runWorkflow() {
	if (executionResult.value) {
		await clearWorkflow()
		await new Promise(r => setTimeout(r, 300))
	}
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		const result = await runtime.run(blueprint, { value: 42 }, { functionRegistry })
		executionResult.value = result
		if (result.status === 'awaiting') {
			awaitingNodes.value = result.context._awaitingNodeIds || []
			serializedContext.value = result.serializedContext
			awaitingNodes.value.forEach((nodeId) => {
				const currentData = nodeData.value.get(nodeId) || { status: 'idle' }
				nodeData.value.set(nodeId, { ...currentData, status: 'pending' })
			})
		}
	} catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error running workflow:', error)
	} finally {
		isRunning.value = false
		await new Promise(r => setTimeout(r))
		flow.fitView({ duration: 1000 })
	}
}

async function resumeWorkflow(nodeId: string, payload: { output: any }) {
	if (!serializedContext.value) return
	isRunning.value = true
	executionError.value = null
	try {
		const result = await runtime.resume(
			blueprint,
			serializedContext.value,
			payload,
			nodeId,
			{ functionRegistry }
		)
		executionResult.value = result
		if (result.status === 'awaiting') {
			awaitingNodes.value = result.context._awaitingNodeIds || []
			serializedContext.value = result.serializedContext
			awaitingNodes.value.forEach((id) => {
				const currentData = nodeData.value.get(id) || { status: 'idle' }
				nodeData.value.set(id, { ...currentData, status: 'pending' })
			})
		} else {
			awaitingNodes.value = []
			serializedContext.value = null
		}
	} catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error resuming workflow:', error)
	} finally {
		isRunning.value = false
		await new Promise(r => setTimeout(r))
		flow.fitView({ duration: 1000 })
	}
}

async function clearWorkflow() {
	viewContext.value = false
	executionResult.value = null
	executionError.value = null
	awaitingNodes.value = []
	serializedContext.value = null
	nodeData.value.clear()
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
}

function toggleLayout() {
	direction.value = direction.value === 'LR' ? 'TB' : 'LR'
	layout(vueFlowNodes, vueFlowEdges, direction.value)
}
</script>

<template>
	<div class="relative flex flex-col h-full rounded-[8px] overflow-hidden">
		<header class="flex items-center gap-2 p-2 bg-[var(--vp-c-bg-alt)] border-b border-[var(--vp-c-divider)]">
			<button @click="runWorkflow" class="brand">
				{{ executionResult ? 'Restart' : 'Run' }}
			</button>
			<!-- <button @click="clearWorkflow" :disabled="!executionResult" class="alt">
				Clear
			</button> -->
			<!-- <button @click="toggleLayout" class="alt">
				Layout: {{ direction }}
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
				<template v-if="viewContext">Hide Context</template>
				<template v-else>View Context</template>
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
			<div class="absolute top-0 right-0 p-2">

			</div>
		</VueFlow>
	</div>
</template>
