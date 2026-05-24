<script lang="ts">
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		type Node,
		type Edge,
		type NodeTypes,
		type EdgeTypes,
		Position,
	} from '@xyflow/svelte'
	import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
	import type { FlowBuilder, WorkflowResult } from 'flowcraft'
	import { EventBus } from './EventBus'
	import { onMount } from 'svelte'
	import InputNode from './Node/InputNode.svelte'
	import DefaultNode from './Node/DefaultNode.svelte'
	import OutputNode from './Node/OutputNode.svelte'
	import LoopbackEdge from './Edge/LoopbackEdge.svelte'
	import type { NodeData } from './Node/FlowNode.svelte'

	export interface HandlePositions {
		source?: Position
		target?: Position
	}

	let {
		expenseFlow,
		positionsMap,
		typesMap,
		handlesMap = {},
		init = {},
	}: {
		expenseFlow: FlowBuilder<Record<string, any>, Record<string, any>>
		positionsMap: Record<string, { x: number; y: number }>
		typesMap: Record<string, 'input' | 'default' | 'output'>
		handlesMap?: Record<string, HandlePositions>
		init?: Record<string, any>
	} = $props()

	const nodeTypes: NodeTypes = { input: InputNode, default: DefaultNode, output: OutputNode }
	const edgeTypes: EdgeTypes = { loopback: LoopbackEdge }

	const eventBus = new EventBus()
	const runtime = new FlowRuntime({ logger: new ConsoleLogger(), eventBus, evaluator: new UnsafeEvaluator() })

	let uiGraph = $derived(expenseFlow.toGraphRepresentation())
	let blueprint = $derived(expenseFlow.toBlueprint())
	let functionRegistry = $derived(expenseFlow.getFunctionRegistry())

	let nodes = $state<Node[]>([])
	let edges = $state<Edge[]>([])

	let isRunning = $state(false)
	let viewContext = $state(false)
	let executionResult = $state<WorkflowResult<any> | null>(null)
	let executionError = $state<string | null>(null)
	let awaitingNodes = $state<string[]>([])
	let serializedContext = $state<string | null>(null)

	function formatLabel(id: string): string {
		return id
			.split('-')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ')
	}

	let initialNodes: Node[] = $derived(
		uiGraph.nodes.map((node) => ({
			id: node.id,
			position: positionsMap[node.id] ?? { x: 0, y: 0 },
			data: {
				label: formatLabel(node.id),
				nodeData: { status: 'idle' } as NodeData,
				sourcePosition: handlesMap[node.id]?.source ?? Position.Right,
				targetPosition: handlesMap[node.id]?.target ?? Position.Left,
			},
			type: typesMap[node.id] || 'default',
			sourcePosition: handlesMap[node.id]?.source ?? Position.Right,
			targetPosition: handlesMap[node.id]?.target ?? Position.Left,
		})),
	)

	let initialEdges: Edge[] = $derived(
		uiGraph.edges.map((edge, i) => ({
			id: `edge-${i}`,
			source: edge.source,
			target: edge.target,
			label: edge.action,
			animated: true,
			...(edge.data?.isLoopback
				? { type: 'loopback', data: { pathType: 'bezier' }, animated: false }
				: {}),
		})),
	)

	$effect(() => {
		nodes = initialNodes
	})

	$effect(() => {
		edges = initialEdges
	})

	function updateNodeData(nodeId: string, patch: Partial<NodeData>) {
		nodes = nodes.map((n) =>
			n.id === nodeId
				? {
						...n,
						data: {
							...n.data,
							nodeData: { ...(n.data.nodeData as NodeData), ...patch },
						},
					}
				: n,
		)
	}

	function resetNodeData() {
		nodes = nodes.map((n) => ({ ...n, data: { ...n.data, nodeData: { status: 'idle' } } }))
	}

	onMount(() => {
		const bus = eventBus
		const off = [
			bus.on('node:start', (e) => {
				updateNodeData(e.payload.nodeId, { status: 'pending', inputs: e.payload.input })
			}),
			bus.on('node:finish', (e) => {
				updateNodeData(e.payload.nodeId, {
					status: 'completed',
					outputs: (e.payload.result as any).output,
				})
			}),
			bus.on('context:change', (e) => {
				const { sourceNode, key, value } = e.payload
				nodes = nodes.map((n) => {
					if (n.id !== sourceNode) return n
					const cur = n.data.nodeData as NodeData
					return {
						...n,
						data: {
							...n.data,
							nodeData: {
								...cur,
								status: 'completed',
								contextChanges: { ...cur.contextChanges, [key]: value },
							},
						},
					}
				})
				awaitingNodes = awaitingNodes.filter((id) => id !== sourceNode)
			}),
			bus.on('batch:start', (e) => {
				updateNodeData(e.payload.batchId, { status: 'pending' })
			}),
			bus.on('batch:finish', (e) => {
				updateNodeData(e.payload.batchId, {
					status: 'completed',
					outputs: e.payload.results,
				})
			}),
		]
		return () => off.forEach((fn) => fn())
	})

	function clearWorkflow() {
		viewContext = false
		executionResult = null
		executionError = null
		awaitingNodes = []
		serializedContext = null
		resetNodeData()
	}

	async function runWorkflow() {
		if (executionResult) {
			clearWorkflow()
			await new Promise((r) => setTimeout(r, 300))
		}
		isRunning = true
		executionError = null
		resetNodeData()
		try {
			const result = await runtime.run(blueprint, init, { functionRegistry })
			executionResult = result
			if (result.status === 'awaiting') {
				const waiting: string[] = (result.context as any)._awaitingNodeIds || []
				awaitingNodes = waiting
				serializedContext = (result as any).serializedContext
				waiting.forEach((id) => updateNodeData(id, { status: 'pending' }))
			}
		} catch (err) {
			executionError = err instanceof Error ? err.message : String(err)
			console.error(err)
		} finally {
			isRunning = false
			await new Promise((r) => setTimeout(r))
		}
	}

	async function resumeWorkflow(nodeId: string, payload: { output: any }) {
		if (!serializedContext) return
		isRunning = true
		executionError = null
		try {
			const result = await runtime.resume(blueprint, serializedContext, payload, nodeId, {
				functionRegistry,
			})
			executionResult = result
			if (result.status === 'awaiting') {
				const waiting: string[] = (result.context as any)._awaitingNodeIds || []
				awaitingNodes = waiting
				serializedContext = (result as any).serializedContext
				waiting.forEach((id) => updateNodeData(id, { status: 'pending' }))
			} else {
				awaitingNodes = []
				serializedContext = null
			}
		} catch (err) {
			executionError = err instanceof Error ? err.message : String(err)
			console.error(err)
		} finally {
			isRunning = false
			await new Promise((r) => setTimeout(r))
		}
	}
</script>

<div class="flow-container">
	<header class="toolbar">
		<button
			class="btn btn-primary"
			onclick={runWorkflow}
			disabled={isRunning}
		>
			{isRunning ? 'Running...' : executionResult ? 'Restart' : 'Run'}
		</button>

		{#if awaitingNodes.length > 0}
			<div class="resume-group">
				<span class="divider"></span>
				<span class="resume-label">Resume:</span>
				{#each awaitingNodes as nodeId}
					<div class="btn-group">
						<button
							class="btn btn-approve"
							onclick={() => resumeWorkflow(nodeId, { output: { approved: true } })}
						>
							Approve
						</button>
						<button
							class="btn btn-deny"
							onclick={() => resumeWorkflow(nodeId, { output: { approved: false } })}
						>
							Deny
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<span class="spacer"></span>

		{#if executionError}
			<span class="error" title={executionError}>{executionError}</span>
		{/if}

		{#if executionResult}
			<button class="btn btn-outline" onclick={() => viewContext = !viewContext}>
				{viewContext ? 'Hide State' : 'View State'}
			</button>
		{/if}
	</header>

	{#if viewContext && executionResult}
		<div class="overlay">
			<pre class="state-json">{JSON.stringify(executionResult, null, 2)}</pre>
		</div>
	{/if}

	<div class="canvas">
		<SvelteFlow
			bind:nodes
			bind:edges
			{nodeTypes}
			{edgeTypes}
			fitView
			maxZoom={1.5}
			minZoom={0.3}
			colorMode="system"
			proOptions={{ hideAttribution: true }}
		>
			<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
		</SvelteFlow>
	</div>
</div>

<style>
	.flow-container {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.toolbar {
		position: relative;
		z-index: 10;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--card));
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.btn {
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		border: none;
		cursor: pointer;
		transition: background-color 0.2s, opacity 0.2s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-outline {
		border: 1px solid hsl(var(--border));
		background: transparent;
		color: hsl(var(--foreground));
	}

	.btn-outline:hover {
		background: hsl(var(--muted));
	}

	.btn-approve {
		background: #16a34a;
		color: white;
	}

	.btn-approve:hover {
		background: #15803d;
	}

	.btn-deny {
		background: #dc2626;
		color: white;
	}

	.btn-deny:hover {
		background: #b91c1c;
	}

	.resume-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.divider {
		width: 1px;
		height: 1rem;
		background: hsl(var(--border));
		margin: 0 0.25rem;
	}

	.resume-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.btn-group {
		display: flex;
		gap: 0.375rem;
	}

	.spacer {
		flex: 1;
	}

	.error {
		font-size: 0.75rem;
		color: #ef4444;
		max-width: 20rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.overlay {
		position: absolute;
		inset: 0;
		top: 41px;
		z-index: 20;
		overflow: auto;
		background: hsl(var(--card) / 0.95);
		backdrop-filter: blur(4px);
	}

	.state-json {
		padding: 1rem;
		font-size: 0.75rem;
		font-family: ui-monospace, Consolas, monospace;
		color: hsl(var(--foreground));
		margin: 0;
		white-space: pre-wrap;
	}

	.canvas {
		flex: 1;
		min-height: 0;
	}
</style>
