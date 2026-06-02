<script setup lang="ts">
import dagre from '@dagrejs/dagre'
import { Position, VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import { useCompiler } from '../../composables/useCompiler'
import { useEventBus } from '../../composables/event-bus'

type Direction = 'LR' | 'TB'

function layoutNodes(
	rawNodes: { id: string; position: { x: number; y: number }; [key: string]: unknown }[],
	edges: { source: string; target: string; [key: string]: unknown }[],
	direction: Direction = 'TB',
) {
	const g = new dagre.graphlib.Graph()
	g.setDefaultEdgeLabel(() => ({}))
	g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 80 })

	const isHorizontal = direction === 'LR'

	for (const node of rawNodes) {
		g.setNode(node.id, { width: 150, height: 50 })
	}

	for (const edge of edges) {
		g.setEdge(edge.source, edge.target)
	}

	dagre.layout(g)

	return rawNodes.map((node) => {
		const pos = g.node(node.id)
		return {
			...node,
			targetPosition: isHorizontal ? Position.Left : Position.Top,
			sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
			position: { x: pos.x, y: pos.y },
		}
	})
}

const DEFAULT_CODE = `@step
export async function loadConfig() {
  return { name: 'Flowcraft', value: 21 }
}

@step
export async function greet(params: { name: string; value: number }) {
  return { message: 'Hello, ' + params.name + '!', value: params.value }
}

@step
export async function double(params: { value: number }) {
  return params.value * 2
}

@flow
export async function demoFlow(context: any) {
  const config = await loadConfig()
  const msg = await greet({ name: config.name, value: config.value })
  const doubled = await double({ value: config.value })
  return { greeting: msg.message, result: doubled }
}
`

const { blueprint, diagnostics, registry, compiling, error, compile } = useCompiler()

const source = ref(DEFAULT_CODE)
const activeTab = ref<'json' | 'diagram' | 'diagnostics'>('diagram')
const fitKey = ref(0)

type NodeDataStatus = 'idle' | 'pending' | 'completed' | 'failed'
const nodeData = ref(new Map<string, { inputs?: any; outputs?: any; status?: NodeDataStatus }>())

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

function resetNodeData() {
	nodeData.value.clear()
	if (blueprint.value) {
		blueprint.value.nodes.forEach((n) => {
			nodeData.value.set(n.id, { status: 'idle' })
		})
	}
}

watch(blueprint, resetNodeData)

const runResult = ref<any>(null)
const runError = ref<string | null>(null)
const isRunning = ref(false)

async function handleRun() {
	if (!blueprint.value) return
	isRunning.value = true
	runError.value = null
	runResult.value = null
	resetNodeData()
	try {
		const functionRegistry = new Map(Object.entries(registry.value))
		const bp = JSON.parse(JSON.stringify(blueprint.value))
		const { eventBus } = useEventBus()
		eventBus.on('node:start', (event: any) => {
			const { nodeId, input } = event.payload
			const current = nodeData.value.get(nodeId) || {}
			nodeData.value.set(nodeId, { ...current, status: 'pending', inputs: input })
			nodeData.value = new Map(nodeData.value)
		})
		eventBus.on('node:finish', (event: any) => {
			const { nodeId, result } = event.payload
			const current = nodeData.value.get(nodeId) || {}
			nodeData.value.set(nodeId, { ...current, status: 'completed', outputs: result.output })
			nodeData.value = new Map(nodeData.value)
		})
		const rt = new FlowRuntime({
			logger: new ConsoleLogger(),
			evaluator: new UnsafeEvaluator(),
			eventBus,
		})
		const result = await rt.run(bp, {}, { functionRegistry })
		runResult.value = result
	} catch (e) {
		runError.value = e instanceof Error ? e.message : String(e)
	} finally {
		isRunning.value = false
	}
}

function handleResetRun() {
	runResult.value = null
	runError.value = null
}

const diagramNodes = computed(() => {
	if (!blueprint.value) return []
	return blueprint.value.nodes.map((n) => ({
		id: n.id,
		type: 'default',
		position: { x: 0, y: 0 },
		data: { label: `${n.id} (${n.uses})` },
	}))
})

const diagramEdges = computed(() => {
	if (!blueprint.value) return []
	return blueprint.value.edges.map((e) => ({
		id: `${e.source}->${e.target}`,
		source: e.source,
		target: e.target,
		label: e.action || e.condition || '',
	}))
})

const laidOutNodes = computed(() => {
	const nodes = diagramNodes.value
	if (nodes.length === 0) return []
	return layoutNodes(nodes, diagramEdges.value, 'LR')
})

const errorCount = computed(() => diagnostics.value.filter((d) => d.severity === 'error').length)
const warningCount = computed(
	() => diagnostics.value.filter((d) => d.severity === 'warning').length,
)
const infoCount = computed(() => diagnostics.value.filter((d) => d.severity === 'info').length)

const severityColor = (severity: string) => {
	switch (severity) {
		case 'error':
			return 'text-red-600'
		case 'warning':
			return 'text-yellow-600'
		default:
			return 'text-blue-600'
	}
}

function handleCompile() {
	compile(source.value).then(() => {
		fitKey.value++
	})
}

function reset() {
	source.value = DEFAULT_CODE
	compile(DEFAULT_CODE).then(() => {
		fitKey.value++
	})
}

onMounted(() => {
	compile(DEFAULT_CODE).then(() => {
		fitKey.value++
	})
})
</script>

<template>
	<div class="border border-(--vp-c-bg-soft) rounded-lg overflow-hidden bg-(--vp-c-bg)">
		<div class="flex h-120">
			<div class="flex flex-col border-r border-(--vp-c-bg-soft) w-1/2">
				<div
					class="flex items-center justify-between px-3 py-2 bg-(--vp-c-bg-alt) border-b border-(--vp-c-bg-soft) text-[13px]"
				>
					<span class="font-semibold text-(--vp-c-text-1)">TypeScript Source</span>
					<span class="text-sm text-neutral-500">@flow / @step annotations</span>
				</div>
				<MonacoEditor v-model="source" />
			</div>

			<div class="flex flex-col w-1/2">
				<div
					class="flex items-center justify-between px-3 py-2 bg-(--vp-c-bg-alt) border-b border-(--vp-c-bg-soft) text-[13px]"
				>
					<div class="flex">
						<button
							:class="[
								'px-3 py-1 text-[13px] border-0 bg-transparent cursor-pointer rounded-t-sm relative',
								activeTab === 'json'
									? 'text-(--vp-c-brand-1) bg-(--vp-c-bg)'
									: 'text-(--vp-c-text-2) hover:text-(--vp-c-text-1)',
							]"
							@click="activeTab = 'json'"
						>
							Blueprint JSON
						</button>
						<button
							:class="[
								'px-3 py-1 text-[13px] border-0 bg-transparent cursor-pointer rounded-t-sm relative',
								activeTab === 'diagram'
									? 'text-(--vp-c-brand-1) bg-(--vp-c-bg)'
									: 'text-(--vp-c-text-2) hover:text-(--vp-c-text-1)',
							]"
							@click="activeTab = 'diagram'"
						>
							Diagram
						</button>
						<button
							:class="[
								'px-3 py-1 text-[13px] border-0 bg-transparent cursor-pointer rounded-t-sm relative',
								activeTab === 'diagnostics'
									? 'text-(--vp-c-brand-1) bg-(--vp-c-bg)'
									: 'text-(--vp-c-text-2) hover:text-(--vp-c-text-1)',
							]"
							@click="activeTab = 'diagnostics'"
						>
							Diagnostics
							<span
								v-if="diagnostics.length > 0"
								class="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] font-semibold bg-(--vp-c-brand-1) text-white ml-1"
							>
								{{ diagnostics.length }}
							</span>
						</button>
					</div>
				</div>

				<div class="flex-1 overflow-auto h-full">
					<div v-if="compiling" class="p-8 text-center text-(--vp-c-text-2) text-sm">
						Compiling...
					</div>

					<div v-else-if="error" class="p-8 text-center text-red-600 text-sm">
						{{ error }}
					</div>

					<template v-else-if="blueprint" class="p-4">
						<div v-if="activeTab === 'json'">
							<pre
								class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-words m-0"
								>{{ JSON.stringify(blueprint, null, 2) }}</pre
							>
						</div>

						<div v-if="activeTab === 'diagram'" class="size-full overflow-hidden">
							<VueFlow
								v-if="blueprint.nodes.length > 0"
								:key="fitKey"
								id="compiler-flow"
								:nodes="laidOutNodes"
								:edges="diagramEdges"
								:fit-view-on-init="true"
								:nodes-draggable="false"
								:nodes-connectable="false"
								:pan-on-drag="true"
								:zoom-on-scroll="true"
								:zoom-on-double-click="true"
								:min-zoom="0.1"
								:max-zoom="1.5"
								class="h-full w-full"
							>
								<Background />
								<template #node-default="nodeProps">
									<NodeDefault
										v-bind="nodeProps"
										:node-data="getNodeData(nodeProps.id)"
									/>
								</template>
								<template #node-input="nodeProps">
									<NodeInput
										v-bind="nodeProps"
										:node-data="getNodeData(nodeProps.id)"
									/>
								</template>
								<template #node-output="nodeProps">
									<NodeOutput
										v-bind="nodeProps"
										:node-data="getNodeData(nodeProps.id)"
									/>
								</template>
							</VueFlow>
							<div v-else class="p-8 text-center text-(--vp-c-text-2) text-sm">
								No nodes in blueprint
							</div>
						</div>

						<div v-if="activeTab === 'diagnostics'" class="p-3">
							<div
								v-if="diagnostics.length === 0"
								class="p-8 text-center text-green-600 text-sm"
							>
								✓ No diagnostics
							</div>
							<div v-else>
								<div class="flex gap-3 mb-2 text-[13px]">
									<span v-if="errorCount > 0" class="text-red-600"
										>{{ errorCount }} errors</span
									>
									<span v-if="warningCount > 0" class="text-yellow-600"
										>{{ warningCount }} warnings</span
									>
									<span v-if="infoCount > 0" class="text-blue-600"
										>{{ infoCount }} info</span
									>
								</div>
								<div
									v-for="(d, i) in diagnostics"
									:key="i"
									:class="[
										'py-1 text-[13px] flex gap-2',
										severityColor(d.severity),
									]"
								>
									<span class="font-semibold shrink-0">[{{ d.severity }}]</span>
									<span class="flex-1">{{ d.message }}</span>
									<span class="text-(--vp-c-text-3) text-xs shrink-0"
										>{{ d.line }}:{{ d.column }}</span
									>
								</div>
							</div>
						</div>
					</template>

					<div v-else class="p-8 text-center text-(--vp-c-text-2) text-sm">
						Click "Compile" to generate the blueprint
					</div>
				</div>
			</div>
		</div>

		<div
			class="flex items-center gap-2 px-3 py-[10px] bg-(--vp-c-bg-alt) border-t border-(--vp-c-bg-soft)"
		>
			<button
				:class="[
					'px-4 py-1.5 text-[13px] font-medium border border-transparent rounded-md cursor-pointer transition-all duration-150',
					compiling
						? 'opacity-50 bg-(--vp-c-brand-1) text-white'
						: 'bg-(--vp-c-brand-1) text-white hover:bg-(--vp-c-brand-2)',
				]"
				:disabled="compiling"
				@click="handleCompile"
			>
				{{ compiling ? 'Compiling…' : 'Compile' }}
			</button>
			<button
				class="px-4 py-1.5 text-[13px] font-medium border border-(--vp-c-bg-soft) rounded-md cursor-pointer transition-all duration-150 bg-(--vp-c-bg-soft) text-(--vp-c-text-1) hover:bg-(--vp-c-bg-mute)"
				@click="reset"
			>
				Reset
			</button>
			<span class="border-l border-(--vp-c-divider) h-5 mx-1" />
			<button
				:class="[
					'px-4 py-1.5 text-[13px] font-medium border border-transparent rounded-md cursor-pointer transition-all duration-150',
					isRunning || !blueprint
						? 'opacity-50 bg-(--vp-c-brand-1) text-white'
						: 'bg-(--vp-c-brand-1) text-white hover:bg-(--vp-c-brand-2)',
				]"
				:disabled="isRunning || !blueprint"
				@click="handleRun"
			>
				{{ isRunning ? 'Running…' : runResult ? 'Re-run' : 'Run' }}
			</button>
			<button
				v-if="runResult || runError"
				class="px-4 py-1.5 text-[13px] font-medium border border-(--vp-c-bg-soft) rounded-md cursor-pointer transition-all duration-150 bg-(--vp-c-bg-soft) text-(--vp-c-text-1) hover:bg-(--vp-c-bg-mute)"
				@click="handleResetRun"
			>
				Clear Result
			</button>
			<span v-if="runResult" class="text-sm text-green-600"> ✓ {{ runResult.status }} </span>
			<span v-if="runError" class="text-sm text-red-600"> ✗ {{ runError }} </span>
			<span class="text-sm text-neutral-400 ml-auto">
				{{
					blueprint
						? `${blueprint.nodes.length} nodes, ${blueprint.edges.length} edges`
						: ''
				}}
			</span>
		</div>
	</div>
</template>
