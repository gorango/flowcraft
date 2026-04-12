'use client'

import '@xyflow/react/dist/style.css'

import {
	Background,
	BackgroundVariant,
	type Edge,
	type Node,
	Position,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
	useReactFlow
} from '@xyflow/react'
import type { FlowBuilder, WorkflowResult } from 'flowcraft'
import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EventBus } from './EventBus'
import type { NodeData } from './FlowNode'
import { LoopbackEdge } from './LoopbackEdge'
import { DefaultNode, InputNode, OutputNode } from './nodes'

// Node and edge type maps must be stable (defined outside components) to
// prevent React Flow from unmounting/remounting nodes on every render.
const nodeTypes = {
	input: InputNode,
	default: DefaultNode,
	output: OutputNode
}

const edgeTypes = {
	loopback: LoopbackEdge
}

function formatLabel(id: string): string {
	return id
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ')
}

export interface HandlePositions {
	source?: Position
	target?: Position
}

export interface FlowDemoProps {
	/** A flowcraft FlowBuilder instance (result of `createFlow(...)`). */
	flow: FlowBuilder<Record<string, any>, Record<string, any>>
	/** Maps node IDs to their (x, y) canvas positions. */
	positionsMap: Record<string, { x: number; y: number }>
	/** Maps node IDs to their React Flow node type ('input' | 'default' | 'output'). */
	typesMap: Record<string, 'input' | 'default' | 'output'>
	/** Optional per-node handle position overrides. Defaults to Right (source) / Left (target). */
	handlesMap?: Record<string, HandlePositions>
	/** Optional initial workflow context passed to FlowRuntime.run(). */
	init?: Record<string, any>
}

// ─── Inner component — lives inside ReactFlowProvider ────────────────────────

function FlowDemoInner({ flow, positionsMap, typesMap, handlesMap = {}, init = {} }: FlowDemoProps) {
	const { fitView } = useReactFlow()

	// Create the event bus and runtime once, on first render.
	const eventBusRef = useRef<EventBus>(null as any)
	const runtimeRef = useRef<FlowRuntime<any, any>>(null as any)
	if (!eventBusRef.current) {
		eventBusRef.current = new EventBus()
		runtimeRef.current = new FlowRuntime({
			logger: new ConsoleLogger(),
			eventBus: eventBusRef.current,
			evaluator: new UnsafeEvaluator()
		})
	}

	// Convert the flowcraft graph to React Flow nodes/edges once.
	const uiGraph = useMemo(() => flow.toGraphRepresentation(), [flow])
	const blueprint = useMemo(() => flow.toBlueprint(), [flow])
	const functionRegistry = useMemo(() => flow.getFunctionRegistry(), [flow])

	const initialNodes: Node[] = useMemo(
		() =>
			uiGraph.nodes.map((node) => ({
				id: node.id,
				position: positionsMap[node.id] ?? { x: 0, y: 0 },
				data: {
					label: formatLabel(node.id),
					nodeData: { status: 'idle' } as NodeData,
					sourcePosition: handlesMap[node.id]?.source ?? Position.Right,
					targetPosition: handlesMap[node.id]?.target ?? Position.Left
				},
				type: typesMap[node.id] || 'default',
				sourcePosition: handlesMap[node.id]?.source ?? Position.Right,
				targetPosition: handlesMap[node.id]?.target ?? Position.Left
			})),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[] // Static — positions and handles don't change after mount
	)

	const initialEdges: Edge[] = useMemo(
		() =>
			uiGraph.edges.map((edge, i) => ({
				id: `edge-${i}`,
				source: edge.source,
				target: edge.target,
				label: edge.action,
				animated: true,
				...(edge.data?.isLoopback
					? { type: 'loopback', data: { pathType: 'bezier' }, animated: false }
					: {})
			})),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	)

	// useNodesState hands drag/position management to React Flow internally,
	// avoiding a full re-render of this component on every drag event.
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
	const [edges] = useEdgesState(initialEdges)

	// Execution state
	const [isRunning, setIsRunning] = useState(false)
	const [viewContext, setViewContext] = useState(false)
	const [executionResult, setExecutionResult] = useState<WorkflowResult<any> | null>(null)
	const [executionError, setExecutionError] = useState<string | null>(null)
	const [awaitingNodes, setAwaitingNodes] = useState<string[]>([])
	const [serializedContext, setSerializedContext] = useState<string | null>(null)

	// Patch a single node's data.nodeData without touching positions or other data.
	const updateNodeData = useCallback(
		(nodeId: string, patch: Partial<NodeData>) => {
			setNodes((nds) =>
				nds.map((n) =>
					n.id === nodeId
						? { ...n, data: { ...n.data, nodeData: { ...(n.data.nodeData as NodeData), ...patch } } }
						: n
				)
			)
		},
		[setNodes]
	)

	const resetNodeData = useCallback(() => {
		setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, nodeData: { status: 'idle' } } })))
	}, [setNodes])

	// Subscribe to flowcraft runtime events and mirror them into node state.
	useEffect(() => {
		const bus = eventBusRef.current
		const off = [
			bus.on('node:start', (e) => {
				updateNodeData(e.payload.nodeId, { status: 'pending', inputs: e.payload.input })
			}),
			bus.on('node:finish', (e) => {
				updateNodeData(e.payload.nodeId, {
					status: 'completed',
					outputs: (e.payload.result as any).output
				})
			}),
			bus.on('context:change', (e) => {
				const { sourceNode, key, value } = e.payload
				setNodes((nds) =>
					nds.map((n) => {
						if (n.id !== sourceNode) return n
						const cur = n.data.nodeData as NodeData
						return {
							...n,
							data: {
								...n.data,
								nodeData: {
									...cur,
									status: 'completed',
									contextChanges: { ...cur.contextChanges, [key]: value }
								}
							}
						}
					})
				)
				setAwaitingNodes((prev) => prev.filter((id) => id !== sourceNode))
			}),
			bus.on('batch:start', (e) => {
				updateNodeData(e.payload.batchId, { status: 'pending' })
			}),
			bus.on('batch:finish', (e) => {
				updateNodeData(e.payload.batchId, { status: 'completed', outputs: e.payload.results })
			})
		]
		return () => off.forEach((fn) => fn())
	}, [updateNodeData, setNodes])

	// ── Workflow actions ────────────────────────────────────────────────────────

	const clearWorkflow = useCallback(() => {
		setViewContext(false)
		setExecutionResult(null)
		setExecutionError(null)
		setAwaitingNodes([])
		setSerializedContext(null)
		resetNodeData()
	}, [resetNodeData])

	const runWorkflow = useCallback(async () => {
		if (executionResult) {
			clearWorkflow()
			await new Promise((r) => setTimeout(r, 300))
		}
		setIsRunning(true)
		setExecutionError(null)
		resetNodeData()
		try {
			const result = await runtimeRef.current.run(blueprint, init, { functionRegistry })
			setExecutionResult(result)
			if (result.status === 'awaiting') {
				const waiting: string[] = (result.context as any)._awaitingNodeIds || []
				setAwaitingNodes(waiting)
				setSerializedContext((result as any).serializedContext)
				waiting.forEach((id) => updateNodeData(id, { status: 'pending' }))
			}
		} catch (err) {
			setExecutionError(err instanceof Error ? err.message : String(err))
			console.error(err)
		} finally {
			setIsRunning(false)
			await new Promise((r) => setTimeout(r))
			fitView({ duration: 800 })
		}
	}, [executionResult, clearWorkflow, resetNodeData, blueprint, init, functionRegistry, updateNodeData, fitView])

	const resumeWorkflow = useCallback(
		async (nodeId: string, payload: { output: any }) => {
			if (!serializedContext) return
			setIsRunning(true)
			setExecutionError(null)
			try {
				const result = await runtimeRef.current.resume(blueprint, serializedContext, payload, nodeId, {
					functionRegistry
				})
				setExecutionResult(result)
				if (result.status === 'awaiting') {
					const waiting: string[] = (result.context as any)._awaitingNodeIds || []
					setAwaitingNodes(waiting)
					setSerializedContext((result as any).serializedContext)
					waiting.forEach((id) => updateNodeData(id, { status: 'pending' }))
				} else {
					setAwaitingNodes([])
					setSerializedContext(null)
				}
			} catch (err) {
				setExecutionError(err instanceof Error ? err.message : String(err))
				console.error(err)
			} finally {
				setIsRunning(false)
				await new Promise((r) => setTimeout(r))
				fitView({ duration: 800 })
			}
		},
		[serializedContext, blueprint, functionRegistry, updateNodeData, fitView]
	)

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<div className="relative flex flex-col h-full rounded-xl overflow-hidden border border-border bg-background shadow-sm">
			{/* Toolbar */}
			<header className="relative z-10 flex flex-wrap items-center gap-2 px-3 py-2 bg-card border-b border-border flex-shrink-0">
				<button
					onClick={runWorkflow}
					disabled={isRunning}
					className="px-3 py-1 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{isRunning ? 'Running…' : executionResult ? 'Restart' : 'Run'}
				</button>

				{awaitingNodes.length > 0 && (
					<div className="flex items-center gap-2">
						<span className="w-px h-4 bg-border mx-1" />
						<span className="text-sm font-medium text-muted-foreground">Resume:</span>
						{awaitingNodes.map((nodeId) => (
							<div key={nodeId} className="flex gap-1.5">
								<button
									onClick={() => resumeWorkflow(nodeId, { output: { approved: true } })}
									className="px-3 py-1 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
								>
									Approve
								</button>
								<button
									onClick={() => resumeWorkflow(nodeId, { output: { approved: false } })}
									className="px-3 py-1 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
								>
									Deny
								</button>
							</div>
						))}
					</div>
				)}

				<span className="flex-1" />

				{executionError && (
					<span className="text-xs text-red-500 max-w-xs truncate" title={executionError}>
						{executionError}
					</span>
				)}

				{executionResult && (
					<button
						onClick={() => setViewContext((v) => !v)}
						className="px-3 py-1 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
					>
						{viewContext ? 'Hide State' : 'View State'}
					</button>
				)}
			</header>

			{/* Final context overlay */}
			{viewContext && executionResult && (
				<div className="absolute inset-0 top-[41px] z-20 overflow-auto bg-card/95 backdrop-blur-sm">
					<pre className="p-4 text-xs font-mono text-foreground">
						{JSON.stringify(executionResult, null, 2)}
					</pre>
				</div>
			)}

			{/* React Flow canvas */}
			<div className="flex-1 min-h-0">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodesChange={onNodesChange}
					fitView
					maxZoom={1.5}
					minZoom={0.3}
					colorMode="system"
					proOptions={{ hideAttribution: true }}
				>
					<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
				</ReactFlow>
			</div>
		</div>
	)
}

// ─── Public export — wraps with ReactFlowProvider ────────────────────────────

/**
 * Renders a flowcraft workflow as an interactive @xyflow/react canvas.
 *
 * Wrap your page with this component and pass a `FlowBuilder` instance
 * (from `createFlow()`). The component creates a `FlowRuntime` internally,
 * connects it to the event bus, and animates each node as it executes.
 */
export function FlowDemo(props: FlowDemoProps) {
	return (
		<ReactFlowProvider>
			<FlowDemoInner {...props} />
		</ReactFlowProvider>
	)
}
