// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { FlowBuilder } from 'flowcraft'
import { FlowcraftCanvas } from '../../src/components/FlowcraftCanvas'

vi.mock('tldraw', () => {
	const MockTldraw = () => createElement('div', { 'data-testid': 'tldraw-canvas' })
	return {
		Tldraw: MockTldraw,
		createShapeId: vi.fn((id: string) => id),
		ShapeUtil: class {
			editor: any
			constructor(editor: any) {
				this.editor = editor
			}
		},
		BindingUtil: class {
			editor: any
			constructor(editor: any) {
				this.editor = editor
			}
		},
		defaultShapeUtils: [],
	}
})

vi.mock('../../src/runtime/RuntimeControls', () => ({
	RuntimeControls: () => createElement('div', { 'data-testid': 'runtime-controls' }),
}))

const mockFlow = {
	toGraphRepresentation: () => ({
		nodes: [
			{ id: 'node-a', uses: 'custom' },
			{ id: 'node-b', uses: 'custom' },
		],
		edges: [{ source: 'node-a', target: 'node-b', action: 'onSuccess' }],
	}),
	toBlueprint: () => ({ id: 'test', nodes: [], edges: [] }),
	getFunctionRegistry: () => ({}),
} as unknown as FlowBuilder<any, any>

const positions = {
	'node-a': { x: 100, y: 200 },
	'node-b': { x: 400, y: 200 },
}

describe('FlowcraftCanvas', () => {
	it('renders without error', () => {
		const container = document.createElement('div')
		const root = createRoot(container)
		expect(() => {
			act(() => {
				root.render(createElement(FlowcraftCanvas, { flow: mockFlow, positions }))
			})
		}).not.toThrow()
		root.unmount()
	})

	it('renders tldraw canvas and runtime controls', () => {
		const container = document.createElement('div')
		const root = createRoot(container)
		act(() => {
			root.render(createElement(FlowcraftCanvas, { flow: mockFlow, positions }))
		})
		expect(container.querySelector('[data-testid="tldraw-canvas"]')).toBeTruthy()
		expect(container.querySelector('[data-testid="runtime-controls"]')).toBeTruthy()
		root.unmount()
	})
})
