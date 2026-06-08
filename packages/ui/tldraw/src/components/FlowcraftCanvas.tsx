'use client'

import { useCallback, useState } from 'react'
import { Tldraw, createShapeId, defaultShapeUtils } from 'tldraw'
import type {
	Editor,
	JsonObject,
	TLAnyShapeUtilConstructor,
	TLCreateShapePartial,
	TLShapeId,
} from 'tldraw'
import { FlowcraftNodeUtil } from '../shapes/FlowcraftNodeUtil'
import type { FlowcraftCanvasProps } from '../shapes/types'
import { FLOWCRAFT_NODE } from '../shapes/types'
import { RuntimeControls } from '../runtime/RuntimeControls'

const shapeUtils: TLAnyShapeUtilConstructor[] = [FlowcraftNodeUtil, ...defaultShapeUtils]

export function FlowcraftCanvas({ flow, positions, init = {}, className }: FlowcraftCanvasProps) {
	const [editor, setEditor] = useState<Editor | null>(null)

	const handleMount = useCallback(
		(ed: Editor) => {
			setEditor(ed)

			const uiGraph = flow.toGraphRepresentation()
			const nodePartials: TLCreateShapePartial[] = []
			const arrowPartials: TLCreateShapePartial[] = []
			const bindingPartials: {
				arrowId: TLShapeId
				sourceId: TLShapeId
				targetId: TLShapeId
			}[] = []

			for (const node of uiGraph.nodes) {
				const shapeId = createShapeId(node.id)
				const pos = positions[node.id] ?? { x: 0, y: 0 }

				nodePartials.push({
					id: shapeId,
					type: FLOWCRAFT_NODE,
					x: pos.x,
					y: pos.y,
					props: {
						nodeDef: { id: node.id, uses: node.uses ?? 'unknown' },
						status: 'idle',
						w: 220,
						h: 80,
					},
				})
			}

			for (const edge of uiGraph.edges) {
				const sourceId = createShapeId(edge.source)
				const targetId = createShapeId(edge.target)
				const arrowId = createShapeId(`arrow-${edge.source}-${edge.target}`)

				const edgeDef: JsonObject = {}
				if (edge.action) edgeDef.action = edge.action
				if (edge.condition) edgeDef.condition = edge.condition
				if (edge.transform) edgeDef.transform = edge.transform
				if (edge.data?.isLoopback) edgeDef.isLoopback = edge.data.isLoopback

				arrowPartials.push({
					id: arrowId,
					type: 'arrow',
					props: {
						start: { x: 0, y: 0 },
						end: { x: 2, y: 0 },
					},
					meta: { edgeDef },
				})

				bindingPartials.push({ arrowId, sourceId, targetId })
			}

			ed.createShapes(nodePartials)
			ed.createShapes(arrowPartials)

			for (const { arrowId, sourceId, targetId } of bindingPartials) {
				ed.createBinding({
					fromId: arrowId,
					toId: sourceId,
					type: 'arrow',
					props: { terminal: 'start' },
				})
				ed.createBinding({
					fromId: arrowId,
					toId: targetId,
					type: 'arrow',
					props: { terminal: 'end' },
				})
			}

			ed.zoomToFit()
		},
		[flow, positions],
	)

	return (
		<div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
			<Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
			<RuntimeControls editor={editor} flow={flow} init={init} />
		</div>
	)
}
