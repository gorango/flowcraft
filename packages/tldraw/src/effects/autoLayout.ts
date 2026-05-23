import type { Editor, TLArrowShape } from 'tldraw'
import type { FlowcraftNodeShape } from '../shapes/types'
import { FLOWCRAFT_NODE } from '../shapes/types'

export interface AutoLayoutOptions {
	spacingX?: number
	spacingY?: number
	padding?: number
}

export function autoLayoutNodes(editor: Editor, options: AutoLayoutOptions = {}): void {
	const { spacingX = 300, spacingY = 150, padding = 50 } = options

	const shapes = editor.getCurrentPageShapes()
	const nodeShapes = shapes.filter((s): s is FlowcraftNodeShape => s.type === FLOWCRAFT_NODE)

	if (nodeShapes.length === 0) return

	const graph = new Map<string, string[]>()
	const nodeMap = new Map<string, FlowcraftNodeShape>()
	const shapeToNodeId = new Map<string, string>()

	for (const shape of nodeShapes) {
		const id = shape.props.nodeDef.id
		nodeMap.set(id, shape)
		graph.set(id, [])
		shapeToNodeId.set(shape.id, id)
	}

	const arrowShapes = shapes.filter((s): s is TLArrowShape => s.type === 'arrow')

	for (const arrow of arrowShapes) {
		const bindings = editor.getBindingsFromShape(arrow.id, 'arrow')
		const startBinding = bindings.find((b) => b.props.terminal === 'start')
		const endBinding = bindings.find((b) => b.props.terminal === 'end')
		if (!startBinding || !endBinding) continue

		const sourceId = shapeToNodeId.get(startBinding.toId)
		const targetId = shapeToNodeId.get(endBinding.toId)
		if (!sourceId || !targetId || sourceId === targetId) continue

		const children = graph.get(sourceId) ?? []
		if (!children.includes(targetId)) {
			graph.set(sourceId, [...children, targetId])
		}
	}

	const visited = new Set<string>()
	const layers: string[][] = []
	const queue: string[] = []

	const allChildren = new Set<string>()
	for (const children of graph.values()) {
		for (const child of children) {
			allChildren.add(child)
		}
	}

	const rooted = new Set<string>()
	for (const id of graph.keys()) {
		if (!allChildren.has(id)) rooted.add(id)
	}

	const roots =
		Array.from(rooted).length > 0
			? Array.from(rooted)
			: nodeShapes.length > 0
				? [nodeShapes[0].props.nodeDef.id]
				: []

	queue.push(...roots)

	while (queue.length > 0) {
		const layer: string[] = []
		const layerSize = queue.length
		for (let i = 0; i < layerSize; i++) {
			const id = queue.shift()!
			if (visited.has(id)) continue
			visited.add(id)
			layer.push(id)
			const children = graph.get(id) ?? []
			for (const child of children) {
				if (!visited.has(child)) {
					queue.push(child)
				}
			}
		}
		if (layer.length > 0) {
			layers.push(layer)
		}
	}

	for (const shape of nodeShapes) {
		if (!visited.has(shape.props.nodeDef.id)) {
			layers.push([shape.props.nodeDef.id])
			visited.add(shape.props.nodeDef.id)
		}
	}

	const updates: Array<{
		id: string
		type: typeof FLOWCRAFT_NODE
		x: number
		y: number
	}> = []

	for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
		const layer = layers[layerIdx]
		for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
			const id = layer[nodeIdx]
			const shape = nodeMap.get(id)
			if (!shape) continue

			updates.push({
				id: shape.id,
				type: FLOWCRAFT_NODE,
				x: padding + nodeIdx * spacingX,
				y: padding + layerIdx * spacingY,
			})
		}
	}

	if (updates.length > 0) {
		editor.updateShapes(updates as any)
	}
}
