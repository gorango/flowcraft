// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { autoLayoutNodes } from '../../src/effects/autoLayout'

function nodeShape(id: string, defId: string) {
	return {
		id,
		type: 'flowcraft-node',
		x: 0,
		y: 0,
		props: { nodeDef: { id: defId } },
	}
}

function arrowShape(id: string) {
	return {
		id,
		type: 'arrow',
		props: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
	}
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

describe('autoLayoutNodes', () => {
	it('does nothing when no node shapes exist', () => {
		const updateShapes = vi.fn()
		const editor = {
			getCurrentPageShapes: vi.fn(() => []),
			getBindingsFromShape: vi.fn(() => []),
			updateShapes,
		} as any

		autoLayoutNodes(editor)
		expect(updateShapes).not.toHaveBeenCalled()
	})

	it('lays out nodes in layers based on arrow connections via binding records', () => {
		const updateShapes = vi.fn()
		const shapes = [nodeShape('s1', 'a'), nodeShape('s2', 'b'), arrowShape('arrow-1')]

		const editor = {
			getCurrentPageShapes: vi.fn(() => shapes),
			getBindingsFromShape: vi.fn(() => [
				bindingRecord('arrow-1', 'start', 's1'),
				bindingRecord('arrow-1', 'end', 's2'),
			]),
			updateShapes,
		} as any

		autoLayoutNodes(editor)
		expect(updateShapes).toHaveBeenCalledTimes(1)
		expect(updateShapes.mock.calls[0][0]).toHaveLength(2)
	})
})
