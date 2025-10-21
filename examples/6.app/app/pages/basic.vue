<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'

interface GreetingWorkflowContext {
	user_id?: number
	user_name?: string
	final_greeting?: string
}

const flow = useVueFlow('basic-workflow')

async function fetchUser() {
	console.log('Fetching user...')
	await new Promise(r => setTimeout(r, 3000))
	return { output: { id: 1, name: 'Alice' } }
}

async function extractName(ctx: any) {
	const input = ctx.input as { name: string }
	console.log('Extracting name...')
	await ctx.context.set('user_name', input.name)
	return { output: input.name }
}

async function createGreeting(ctx: any) {
	const input = ctx.input as string
	console.log('Creating greeting...')
	const greeting = `Hello, ${input}!`
	await new Promise(r => setTimeout(r, 2000))
	await ctx.context.set('final_greeting', greeting)
	return { output: greeting }
}

const greetingFlow = createFlow<GreetingWorkflowContext>('greeting-workflow')
	.node('fetch-user', fetchUser)
	.node('extract-name', extractName)
	.node('create-greeting', createGreeting)
	.edge('fetch-user', 'extract-name')
	.edge('extract-name', 'create-greeting')

const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()

const vueFlowNodes: Node[] = blueprint.nodes.map((node, index) => ({
	id: node.id,
	position: { x: 1 + index * (256 + 48), y: 100 },
	data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
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

onMounted(() => {
	flow.setNodes(vueFlowNodes)
	flow.setEdges(vueFlowEdges)
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
		const result = await runtime.run(blueprint, {}, { functionRegistry })
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
				<CardTitle>Basic Workflow Example</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>This workflow demonstrates a simple sequence:</p>
					<ol class="list-decimal list-inside mt-2">
						<li><strong>Fetch User:</strong> Simulates fetching user data.</li>
						<li><strong>Extract Name:</strong> Extracts the user's name and stores it in context.</li>
						<li><strong>Create Greeting:</strong> Generates a personalized greeting using the stored name.</li>
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
							:nodes-draggable="false"
							:nodes-connectable="false"
							:elements-selectable="false"
							:delete-key-code="null"
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
					<h3 class="font-bold">
						Execution Error:
					</h3>
					<p>{{ executionError }}</p>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
