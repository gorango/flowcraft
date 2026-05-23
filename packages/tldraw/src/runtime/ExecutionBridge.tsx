import { useEffect } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import type { FlowcraftEvent } from 'flowcraft'
import { FLOWCRAFT_NODE, type FlowcraftNodeShape } from '../shapes/types'
import type { EventBus } from '../sync/EventBus'
import type { NodeStatus } from '../shapes/types'

export function useExecutionBridge(editor: Editor | null, eventBus: EventBus | null): void {
	useEffect(() => {
		if (!editor || !eventBus) return

		const off: (() => void)[] = []

		off.push(
			eventBus.on('node:start', (e) => {
				updateShapeStatus(editor, e, 'pending', { inputs: e.payload.input })
			}),
		)

		off.push(
			eventBus.on('node:finish', (e) => {
				updateShapeStatus(editor, e, 'completed', {
					outputs: e.payload.result.output,
				})
			}),
		)

		off.push(
			eventBus.on('node:error', (e) => {
				updateShapeStatus(editor, e, 'failed', {
					error: e.payload.error?.message ?? 'Unknown error',
				})
			}),
		)

		off.push(
			eventBus.on('context:change', (e) => {
				const { sourceNode } = e.payload
				const shapeId = `shape:${sourceNode}` as TLShapeId
				const shape = editor.getShape<FlowcraftNodeShape>(shapeId)
				if (!shape) return

				const currentData = shape.props.nodeData ?? {}
				editor.updateShape<FlowcraftNodeShape>({
					id: shapeId,
					type: FLOWCRAFT_NODE,
					props: {
						status: 'completed',
						nodeData: {
							...currentData,
							contextChanges: {
								...currentData.contextChanges,
								[e.payload.key]: e.payload.value,
							},
						},
					},
				})
			}),
		)

		off.push(
			eventBus.on('batch:start', (e) => {
				updateShapeStatus(editor, e, 'pending')
			}),
		)

		off.push(
			eventBus.on('batch:finish', (e) => {
				updateShapeStatus(editor, e, 'completed', { outputs: e.payload.results })
			}),
		)

		return () => {
			for (const fn of off) fn()
		}
	}, [editor, eventBus])
}

function updateShapeStatus(
	editor: Editor,
	event: FlowcraftEvent,
	status: NodeStatus,
	extra: Record<string, unknown> = {},
): void {
	const nodeId =
		'nodeId' in event.payload
			? (event.payload as { nodeId: string }).nodeId
			: 'batchId' in event.payload
				? (event.payload as { batchId: string }).batchId
				: undefined
	if (!nodeId) return

	const shapeId = `shape:${nodeId}` as TLShapeId
	const shape = editor.getShape<FlowcraftNodeShape>(shapeId)
	if (!shape) return

	const currentData = shape.props.nodeData ?? {}
	editor.updateShape<FlowcraftNodeShape>({
		id: shapeId,
		type: FLOWCRAFT_NODE,
		props: {
			status,
			nodeData: { ...currentData, ...extra },
		},
	})
}
