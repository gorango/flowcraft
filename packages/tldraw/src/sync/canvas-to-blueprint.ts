import type { Editor } from 'tldraw'
import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import type { FlowcraftNodeShape } from '../shapes/types'
import { FLOWCRAFT_NODE } from '../shapes/types'

export function canvasToBlueprint(
	editor: Editor,
): WorkflowBlueprint & { positions: Record<string, { x: number; y: number }> } {
	const shapes = editor.getCurrentPageShapes()

	const nodeShapes = shapes.filter((s): s is FlowcraftNodeShape => s.type === FLOWCRAFT_NODE)
	const arrowShapes = shapes.filter((s) => s.type === 'arrow')

	const nodes: NodeDefinition[] = []
	const positions: Record<string, { x: number; y: number }> = {}
	const nodeIdByShapeId = new Map<string, string>()

	for (const shape of nodeShapes) {
		const nodeDef: NodeDefinition = shape.props.nodeDef
		nodes.push(nodeDef)
		nodeIdByShapeId.set(shape.id, nodeDef.id)
		positions[nodeDef.id] = { x: shape.x, y: shape.y }
	}

	const edges: EdgeDefinition[] = []

	for (const arrow of arrowShapes) {
		const bindings = editor.getBindingsFromShape(arrow.id, 'arrow')
		const startBinding = bindings.find((b) => b.props.terminal === 'start')
		const endBinding = bindings.find((b) => b.props.terminal === 'end')

		if (!startBinding || !endBinding) continue

		const sourceNodeId = nodeIdByShapeId.get(startBinding.toId)
		const targetNodeId = nodeIdByShapeId.get(endBinding.toId)
		if (!sourceNodeId || !targetNodeId) continue

		const meta = (arrow.meta as Record<string, any>)?.edgeDef ?? {}
		const edge: EdgeDefinition = { source: sourceNodeId, target: targetNodeId }
		if (meta.action) edge.action = String(meta.action)
		if (meta.condition) edge.condition = String(meta.condition)
		if (meta.transform) edge.transform = String(meta.transform)
		edges.push(edge)
	}

	return { id: 'visual-workflow', nodes, edges, positions }
}
