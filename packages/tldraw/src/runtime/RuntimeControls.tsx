import { useCallback, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import type { FlowBuilder, WorkflowResult } from 'flowcraft'
import { ConsoleLogger, FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import { EventBus } from '../sync/EventBus'
import { useExecutionBridge } from './ExecutionBridge'

export interface RuntimeControlsProps {
	editor: Editor | null
	flow: FlowBuilder<any, any>
	init?: Record<string, any>
}

export function RuntimeControls({ editor, flow, init = {} }: RuntimeControlsProps) {
	const eventBusRef = useRef<EventBus>(null as unknown as EventBus)
	const runtimeRef = useRef<FlowRuntime<any, any>>(null as unknown as FlowRuntime<any, any>)

	if (!eventBusRef.current) {
		eventBusRef.current = new EventBus()
		runtimeRef.current = new FlowRuntime({
			logger: new ConsoleLogger(),
			eventBus: eventBusRef.current,
			evaluator: new UnsafeEvaluator(),
		})
	}

	useExecutionBridge(editor, eventBusRef.current)

	const blueprint = flow.toBlueprint()
	const functionRegistry = flow.getFunctionRegistry()

	const [isRunning, setIsRunning] = useState(false)
	const [executionResult, setExecutionResult] = useState<WorkflowResult<any> | null>(null)
	const [executionError, setExecutionError] = useState<string | null>(null)
	const [awaitingNodes, setAwaitingNodes] = useState<string[]>([])
	const [serializedContext, setSerializedContext] = useState<string | null>(null)
	const [viewContext, setViewContext] = useState(false)

	const runWorkflow = useCallback(async () => {
		if (executionResult) {
			setExecutionResult(null)
			setExecutionError(null)
			setAwaitingNodes([])
			setSerializedContext(null)
		}

		setIsRunning(true)
		setExecutionError(null)

		try {
			const result = await runtimeRef.current.run(blueprint, init, { functionRegistry })
			setExecutionResult(result)
			if (result.status === 'awaiting') {
				const waiting: string[] = result.context._awaitingNodeIds || []
				setAwaitingNodes(waiting)
				setSerializedContext(result.serializedContext)
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setExecutionError(msg)
		} finally {
			setIsRunning(false)
		}
	}, [blueprint, init, functionRegistry, executionResult])

	const resumeWorkflow = useCallback(
		async (nodeId: string, payload: { output: any }) => {
			if (!serializedContext) return
			setIsRunning(true)
			setExecutionError(null)

			try {
				const result = await runtimeRef.current.resume(
					blueprint,
					serializedContext,
					payload,
					nodeId,
					{
						functionRegistry,
					},
				)
				setExecutionResult(result)
				if (result.status === 'awaiting') {
					const waiting: string[] = result.context._awaitingNodeIds || []
					setAwaitingNodes(waiting)
					setSerializedContext(result.serializedContext)
				} else {
					setAwaitingNodes([])
					setSerializedContext(null)
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setExecutionError(msg)
			} finally {
				setIsRunning(false)
			}
		},
		[serializedContext, blueprint, functionRegistry],
	)

	return (
		<>
			<div
				style={{
					position: 'absolute',
					top: 50,
					left: 8,
					zIndex: 100,
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '4px 8px',
					background: 'rgba(255,255,255,0.95)',
					border: '1px solid #e5e7eb',
					borderRadius: 8,
					boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
					fontFamily: 'ui-sans-serif, system-ui, sans-serif',
					fontSize: 13,
				}}
			>
				<button
					type="button"
					onClick={runWorkflow}
					disabled={isRunning}
					style={{
						padding: '4px 12px',
						fontSize: 12,
						fontWeight: 500,
						border: 'none',
						borderRadius: 4,
						background: isRunning ? '#d1d5db' : executionResult ? '#6b7280' : '#3b82f6',
						color: '#fff',
						cursor: isRunning ? 'not-allowed' : 'pointer',
					}}
				>
					{isRunning ? 'Running...' : executionResult ? 'Restart' : 'Run'}
				</button>

				{awaitingNodes.map((nodeId) => (
					<div key={nodeId} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
						<span style={{ fontSize: 11, color: '#6b7280' }}>{nodeId}:</span>
						<button
							type="button"
							onClick={() => resumeWorkflow(nodeId, { output: { approved: true } })}
							style={{
								padding: '2px 8px',
								fontSize: 11,
								border: 'none',
								borderRadius: 3,
								background: '#22c55e',
								color: '#fff',
								cursor: 'pointer',
							}}
						>
							Approve
						</button>
						<button
							type="button"
							onClick={() => resumeWorkflow(nodeId, { output: { approved: false } })}
							style={{
								padding: '2px 8px',
								fontSize: 11,
								border: 'none',
								borderRadius: 3,
								background: '#ef4444',
								color: '#fff',
								cursor: 'pointer',
							}}
						>
							Deny
						</button>
					</div>
				))}

				{executionError && (
					<span
						style={{
							fontSize: 11,
							color: '#ef4444',
							maxWidth: 200,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{executionError}
					</span>
				)}

				{executionResult && (
					<button
						type="button"
						onClick={() => setViewContext((v) => !v)}
						style={{
							padding: '4px 8px',
							fontSize: 11,
							border: '1px solid #d1d5db',
							borderRadius: 4,
							background: '#fff',
							cursor: 'pointer',
						}}
					>
						{viewContext ? 'Hide State' : 'View State'}
					</button>
				)}
			</div>

			{viewContext && executionResult && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						top: 44,
						zIndex: 99,
						overflow: 'auto',
						background: 'rgba(255,255,255,0.97)',
						padding: 16,
					}}
				>
					<pre
						style={{
							fontSize: 11,
							fontFamily: 'monospace',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-all',
						}}
					>
						{JSON.stringify(executionResult, null, 2)}
					</pre>
				</div>
			)}
		</>
	)
}
