<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'

interface MultiWaitWorkflowContext {
	input?: number
	_outputs?: Record<string, any>
	_awaitingNodeIds?: string[]
}

const flow = useVueFlow('hitl-workflow')

async function startNode({ input }: { input?: any }) {
	console.log('Starting workflow with input:', input)
	return { output: { value: input?.value || 0 } }
}

async function process1({ input }: { input?: any }) {
	console.log('Processing branch 1 with input:', input)
	return { output: { result1: `Branch 1: ${input?.value}` } }
}

async function process2({ input }: { input?: any }) {
	console.log('Processing branch 2 with input:', input)
	return { output: { result2: `Branch 2: ${input?.value}` } }
}

async function gather({ input }: { input?: any }) {
	console.log('Combining results from both branches')
	return { output: { combined: `Results: ${input?.result1?.result1}, ${input?.result2?.result2}` } }
}

const multiWaitFlow = createFlow<MultiWaitWorkflowContext>('multi-wait-workflow')
	.node('start', startNode)
	.edge('start', 'wait1')
	.wait('wait1')
	.edge('wait1', 'process1')
	.node('process1', process1)
	.edge('start', 'wait2')
	.wait('wait2')
	.edge('wait2', 'process2')
	.node('process2', process2)
	.edge('process1', 'gather')
	.edge('process2', 'gather')
	.node('gather', gather, { inputs: { result1: '_outputs.process1', result2: '_outputs.process2' } })

const blueprint = multiWaitFlow.toBlueprint()
const functionRegistry = multiWaitFlow.getFunctionRegistry()

const vueFlowNodes: Node[] = blueprint.nodes.map((node, index) => ({
	id: node.id,
	position: { x: 1 + index * (256 + 48), y: 100 },
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) },
	targetPosition: Position.Left,
	sourcePosition: Position.Right,
}))

const vueFlowEdges: Edge[] = blueprint.edges.map((edge, index) => ({
	id: `edge-${index}`,
	source: edge.source,
	target: edge.target,
	type: 'smoothstep',
}))

const nodes = computed(() => flow.nodes.value)
const edges = computed(() => flow.edges.value)

const { layout } = useLayout()

onMounted(() => {
	flow.setNodes(layout(vueFlowNodes, vueFlowEdges, 'LR'))
	flow.setEdges(vueFlowEdges)
})

const { eventBus } = useEventBus()

const nodeData = ref(
	new Map<
		string,
		{
			inputs?: any
			outputs?: any
			contextChanges?: Record<string, any>
			status?: 'idle' | 'pending' | 'completed' | 'failed'
		}
	>(),
)

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

eventBus.on('context:change', (event) => {
	const { sourceNode, key, value } = event.payload as any
	const currentData = nodeData.value.get(sourceNode) || { contextChanges: {} }
	const updatedContextChanges = { ...currentData.contextChanges, [key]: value }
	nodeData.value.set(sourceNode, { ...currentData, contextChanges: updatedContextChanges, status: 'completed' })
	awaitingNodes.value = awaitingNodes.value.filter((id) => id !== sourceNode)
})

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
})

const isRunning = ref(false)
const executionResult = ref<any>(null)
const executionError = ref<string | null>(null)
const awaitingNodes = ref<string[]>([])
const serializedContext = ref<string | null>(null)

async function runWorkflow() {
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
	}
}

async function resumeWorkflow(nodeId: string) {
	if (!serializedContext.value) return
	isRunning.value = true
	executionError.value = null
	try {
		const result = await runtime.resume(blueprint, serializedContext.value, { output: { value: 42 } }, nodeId, {
			functionRegistry,
		})
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
	}
}

async function clearWorkflow() {
	executionResult.value = null
	executionError.value = null
	awaitingNodes.value = []
	serializedContext.value = null
	nodeData.value.clear()
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
}
</script>

<template>
  <div class="mx-auto max-w-6xl p-4">
    <Card>
      <CardHeader>
        <CardTitle>Human-in-the-Loop Workflow Example</CardTitle>
      </CardHeader>

      <CardContent class="space-y-6">
        <div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
          <p>This workflow demonstrates multiple concurrent wait nodes:</p>
          <ol class="list-decimal list-inside mt-2">
            <li><strong>Start:</strong> Processes initial input.</li>
            <li><strong>Wait1 & Wait2:</strong> Pauses for human input in parallel.</li>
            <li><strong>Process1 & Process2:</strong> Continues after resumption.</li>
            <li><strong>Gather:</strong> Combines results from both branches.</li>
          </ol>
        </div>

        <div class="flex gap-2">
          <Button :disabled="isRunning" @click="runWorkflow">
            {{ isRunning ? 'Running...' : 'Run Workflow' }}
          </Button>
          <Button variant="outline" @click="clearWorkflow">
            Clear Results
          </Button>
          <div v-if="awaitingNodes?.length > 0" class="flex gap-2">
            <span class="text-sm">Resume:</span>
            <Button v-for="nodeId in awaitingNodes" :key="nodeId" size="sm" @click="resumeWorkflow(nodeId)">
              {{ nodeId }}
            </Button>
          </div>
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

        <div v-if="executionError" class="p-4 bg-destructive text-destructive-foreground rounded-lg">
          <h3 class="font-bold">Execution Error:</h3>
          <p>{{ executionError }}</p>
        </div>

        <div v-if="executionResult" class="p-4 bg-muted/50 border rounded-lg">
          <h3 class="font-bold">Execution Result:</h3>
          <pre class="text-sm overflow-auto">{{ JSON.stringify(executionResult, null, 2) }}</pre>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
