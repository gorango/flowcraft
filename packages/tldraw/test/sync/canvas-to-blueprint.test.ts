import { describe, expect, it, vi } from 'vitest'
import { canvasToBlueprint } from '../../src/sync/canvas-to-blueprint'

vi.mock('tldraw', () => ({}))

function nodeShape(id: string, defId: string, uses: string, x = 0, y = 0) {
	return {
		id,
		type: 'flowcraft-node',
		x,
		y,
		props: { nodeDef: { id: defId, uses } },
	}
}

function arrowShape(id: string, meta: Record<string, unknown> = {}) {
	return {
		id,
		type: 'arrow',
		props: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
		meta,
	}
}

function createMockEditor(shapes: any[], bindings: any[] = []) {
	return {
		getCurrentPageShapes: vi.fn(() => shapes),
		getBindingsFromShape: vi.fn(() => bindings),
	} as any
}

function bindingRecord(arrowId: string, terminal: 'start' | 'end', targetShapeId: string) {
	return {
		id: `binding-${arrowId}-${terminal}`,
		typeName: 'binding',
		type: 'arrow',
		fromId: arrowId,
		toId: targetShapeId,
		props: { terminal },
	}
}

describe('canvasToBlueprint', () => {
	it('extracts NodeDefinition and positions from node shapes', () => {
		const editor = createMockEditor([
			nodeShape('shape-fetch', 'fetch-data', 'http-request', 100, 200),
			nodeShape('shape-parse', 'parse-json', 'json-transform', 300, 400),
		])

		const result = canvasToBlueprint(editor)

		expect(result.nodes).toEqual([
			{ id: 'fetch-data', uses: 'http-request' },
			{ id: 'parse-json', uses: 'json-transform' },
		])
		expect(result.positions).toEqual({
			'fetch-data': { x: 100, y: 200 },
			'parse-json': { x: 300, y: 400 },
		})
	})

	it('extracts EdgeDefinition from arrow shapes via binding records', () => {
		const shapes = [
			nodeShape('shape-fetch', 'fetch-data', 'http-request'),
			nodeShape('shape-parse', 'parse-json', 'json-transform'),
			arrowShape('arrow-1', {
				edgeDef: {
					action: 'onSuccess',
					condition: '{{ok}}',
					transform: '{{body}}',
				},
			}),
		]
		const bindings = [
			bindingRecord('arrow-1', 'start', 'shape-fetch'),
			bindingRecord('arrow-1', 'end', 'shape-parse'),
		]
		const editor = createMockEditor(shapes, bindings)

		const result = canvasToBlueprint(editor)

		expect(result.edges).toEqual([
			{
				source: 'fetch-data',
				target: 'parse-json',
				action: 'onSuccess',
				condition: '{{ok}}',
				transform: '{{body}}',
			},
		])
	})

	it('includes edge fields only when present in meta', () => {
		const shapes = [
			nodeShape('shape-a', 'node-a', 'a'),
			nodeShape('shape-b', 'node-b', 'b'),
			arrowShape('arrow-1', { edgeDef: { action: 'go' } }),
		]
		const bindings = [
			bindingRecord('arrow-1', 'start', 'shape-a'),
			bindingRecord('arrow-1', 'end', 'shape-b'),
		]
		const editor = createMockEditor(shapes, bindings)

		const result = canvasToBlueprint(editor)

		expect(result.edges).toEqual([{ source: 'node-a', target: 'node-b', action: 'go' }])
	})

	it('skips arrows without start/end bindings', () => {
		const shapes = [
			nodeShape('shape-a', 'node-a', 'a'),
			nodeShape('shape-b', 'node-b', 'b'),
			arrowShape('arrow-1', {}),
		]
		const editor = createMockEditor(shapes, []) // no bindings

		const result = canvasToBlueprint(editor)
		expect(result.edges).toEqual([])
	})

	it('skips arrows whose source or target node is not in the node shapes', () => {
		const shapes = [nodeShape('shape-a', 'node-a', 'a'), arrowShape('arrow-1', {})]
		const bindings = [
			bindingRecord('arrow-1', 'start', 'shape-a'),
			bindingRecord('arrow-1', 'end', 'shape-ghost'),
		]
		const editor = createMockEditor(shapes, bindings)

		const result = canvasToBlueprint(editor)
		expect(result.edges).toEqual([])
	})

	it('returns visual-workflow id', () => {
		const editor = createMockEditor([])
		const result = canvasToBlueprint(editor)
		expect(result.id).toBe('visual-workflow')
	})
})
