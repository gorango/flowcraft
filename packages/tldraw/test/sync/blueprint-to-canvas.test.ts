import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import type { WorkflowBlueprint } from 'flowcraft'
import { blueprintToCanvas } from '../../src/sync/blueprint-to-canvas'

vi.mock('tldraw', () => ({
	createShapeId: vi.fn((id: string) => id),
}))

function createMockEditor(existingShapes: any[] = []) {
	const shapes = [...(existingShapes as any[])]
	return {
		getCurrentPageShapes: vi.fn(() => shapes),
		createShapes: vi.fn((partials: any[]) => {
			for (const p of partials) {
				shapes.push(p)
			}
		}),
		createBinding: vi.fn(),
		deleteShapes: vi.fn(),
		zoomToFit: vi.fn(),
	} as unknown as Editor
}

const sampleBlueprint: WorkflowBlueprint = {
	id: 'test-blueprint',
	nodes: [
		{ id: 'fetch-data', uses: 'http-request' },
		{ id: 'parse-json', uses: 'json-transform' },
	],
	edges: [
		{
			source: 'fetch-data',
			target: 'parse-json',
			action: 'onSuccess',
			condition: '{{status === 200}}',
			transform: '{{body}}',
		},
	],
}

describe('blueprintToCanvas', () => {
	it('creates node shapes for each blueprint node with auto-layout', () => {
		const editor = createMockEditor()
		blueprintToCanvas(editor, sampleBlueprint)

		expect(editor.createShapes).toHaveBeenCalledWith([
			{
				id: 'fetch-data',
				type: 'flowcraft-node',
				x: 0,
				y: 0,
				props: { nodeDef: sampleBlueprint.nodes[0], status: 'idle', w: 220, h: 80 },
			},
			{
				id: 'parse-json',
				type: 'flowcraft-node',
				x: 300,
				y: 0,
				props: { nodeDef: sampleBlueprint.nodes[1], status: 'idle', w: 220, h: 80 },
			},
		])
	})

	it('uses positions from options when provided', () => {
		const editor = createMockEditor()
		blueprintToCanvas(editor, sampleBlueprint, {
			positions: { 'fetch-data': { x: 100, y: 200 } },
		})

		expect(editor.createShapes).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: 'fetch-data', x: 100, y: 200 })]),
		)
		expect(editor.createShapes).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: 'parse-json', x: 300, y: 0 })]),
		)
	})

	it('creates arrow shapes and binding records for each edge', () => {
		const editor = createMockEditor()
		blueprintToCanvas(editor, sampleBlueprint)

		const calls = (editor.createShapes as any).mock.calls
		const arrowCall = calls[1][0]
		expect(arrowCall).toHaveLength(1)
		expect(arrowCall[0]).toMatchObject({
			id: 'arrow-fetch-data-parse-json',
			type: 'arrow',
			props: {
				start: { x: 0, y: 0 },
				end: { x: 2, y: 0 },
			},
			meta: {
				edgeDef: {
					action: 'onSuccess',
					condition: '{{status === 200}}',
					transform: '{{body}}',
				},
			},
		})

		expect(editor.createBinding).toHaveBeenCalledWith({
			fromId: 'arrow-fetch-data-parse-json',
			toId: 'fetch-data',
			type: 'arrow',
			props: { terminal: 'start' },
		})
		expect(editor.createBinding).toHaveBeenCalledWith({
			fromId: 'arrow-fetch-data-parse-json',
			toId: 'parse-json',
			type: 'arrow',
			props: { terminal: 'end' },
		})
	})

	it('removes stale node and arrow shapes', () => {
		const editor = createMockEditor([
			{ id: 'stale-node', type: 'flowcraft-node' },
			{ id: 'stale-arrow', type: 'arrow' },
			{ id: 'fetch-data', type: 'flowcraft-node' },
		])

		blueprintToCanvas(editor, sampleBlueprint)

		expect(editor.deleteShapes).toHaveBeenCalledWith(['stale-node', 'stale-arrow'])
	})

	it('skips edges whose source or target node does not exist', () => {
		const blueprint: WorkflowBlueprint = {
			id: 'partial',
			nodes: [{ id: 'source-node', uses: 'a' }],
			edges: [{ source: 'source-node', target: 'missing-node' }],
		}
		const editor = createMockEditor()
		blueprintToCanvas(editor, blueprint)

		const calls = (editor.createShapes as any).mock.calls

		expect(calls[0][0]).toHaveLength(1)
		expect(calls[0][0][0].type).toBe('flowcraft-node')

		expect(calls[1][0]).toHaveLength(0)
	})

	it('does not delete shapes that are still in use', () => {
		const editor = createMockEditor([
			{ id: 'fetch-data', type: 'flowcraft-node' },
			{ id: 'parse-json', type: 'flowcraft-node' },
		])
		blueprintToCanvas(editor, sampleBlueprint)
		expect(editor.deleteShapes).not.toHaveBeenCalled()
	})

	it('calls zoomToFit at the end', () => {
		const editor = createMockEditor()
		blueprintToCanvas(editor, sampleBlueprint)
		expect(editor.zoomToFit).toHaveBeenCalledTimes(1)
	})
})
