import type { Editor, TLCreateShapePartial, TLShapeId } from 'tldraw'
import { createShapeId } from 'tldraw'
import type { WorkflowBlueprint } from 'flowcraft'
import { FLOWCRAFT_NODE } from '../shapes/types'
import type { FlowcraftNodeShape } from '../shapes/types'

export interface BlueprintToCanvasOptions {
	positions?: Record<string, { x: number; y: number }>
}

export function blueprintToCanvas(
	editor: Editor,
	blueprint: WorkflowBlueprint,
	options: BlueprintToCanvasOptions = {},
): void {
	const existingNodeIds = new Set(
		editor
			.getCurrentPageShapes()
			.filter((s) => s.type === FLOWCRAFT_NODE)
			.map((s) => s.id),
	)

	const GAP_X = 300
	const GAP_Y = 150
	const COLS = 3

	const newNodeIds = new Set<TLShapeId>()
	const nodePartials: TLCreateShapePartial<FlowcraftNodeShape>[] = []

	for (let i = 0; i < blueprint.nodes.length; i++) {
		const nodeDef = blueprint.nodes[i]
		const shapeId = createShapeId(nodeDef.id)
		newNodeIds.add(shapeId)

		const explicitPos = options.positions?.[nodeDef.id]
		const pos = explicitPos ?? {
			x: (i % COLS) * GAP_X,
			y: Math.floor(i / COLS) * GAP_Y,
		}

		nodePartials.push({
			id: shapeId,
			type: FLOWCRAFT_NODE,
			x: pos.x,
			y: pos.y,
			props: {
				nodeDef,
				status: 'idle',
				w: 220,
				h: 80,
			},
		})
	}

	const existingArrowIds = new Set(
		editor
			.getCurrentPageShapes()
			.filter((s) => s.type === 'arrow')
			.map((s) => s.id),
	)

	const usedArrowIds = new Set<TLShapeId>()
	const arrowPartials: TLCreateShapePartial[] = []

	for (const edge of blueprint.edges) {
		const sourceShapeId = createShapeId(edge.source)
		const targetShapeId = createShapeId(edge.target)

		if (!newNodeIds.has(sourceShapeId) || !newNodeIds.has(targetShapeId)) continue

		const arrowId = createShapeId(`arrow-${edge.source}-${edge.target}`)
		usedArrowIds.add(arrowId)

		const edgeDef: Record<string, unknown> = {}
		if (edge.action) edgeDef.action = edge.action
		if (edge.condition) edgeDef.condition = edge.condition
		if (edge.transform) edgeDef.transform = edge.transform

		arrowPartials.push({
			id: arrowId,
			type: 'arrow',
			props: {
				start: { x: 0, y: 0 },
				end: { x: 2, y: 0 },
			},
			meta: { edgeDef },
		} as TLCreateShapePartial)
	}

	editor.createShapes(nodePartials)
	editor.createShapes(arrowPartials)

	// Create binding records for each arrow
	for (const edge of blueprint.edges) {
		const sourceShapeId = createShapeId(edge.source)
		const targetShapeId = createShapeId(edge.target)
		const arrowId = createShapeId(`arrow-${edge.source}-${edge.target}`)

		if (!newNodeIds.has(sourceShapeId) || !newNodeIds.has(targetShapeId)) continue

		editor.createBinding({
			fromId: arrowId,
			toId: sourceShapeId,
			type: 'arrow',
			props: { terminal: 'start' },
		})
		editor.createBinding({
			fromId: arrowId,
			toId: targetShapeId,
			type: 'arrow',
			props: { terminal: 'end' },
		})
	}

	const shapesToDelete: TLShapeId[] = []
	for (const id of existingNodeIds) {
		if (!newNodeIds.has(id)) shapesToDelete.push(id)
	}
	for (const id of existingArrowIds) {
		if (!usedArrowIds.has(id)) shapesToDelete.push(id)
	}

	if (shapesToDelete.length > 0) {
		editor.deleteShapes(shapesToDelete)
	}

	editor.zoomToFit()
}
