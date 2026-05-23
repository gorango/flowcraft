// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { WorkflowBlueprint } from 'flowcraft'
import { FlowcraftEditor } from '../../src/components/FlowcraftEditor'

vi.mock('tldraw', () => {
	const MockTldraw = () => createElement('div', { 'data-testid': 'tldraw-editor' })
	return {
		Tldraw: MockTldraw,
		createShapeId: vi.fn((id: string) => id),
		createBindingId: vi.fn(() => 'binding-1'),
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
		defaultBindingUtils: [],
	}
})

const sampleBlueprint: WorkflowBlueprint = {
	id: 'test-wf',
	nodes: [
		{ id: 'step-1', uses: 'custom' },
		{ id: 'step-2', uses: 'custom' },
	],
	edges: [{ source: 'step-1', target: 'step-2' }],
}

describe('FlowcraftEditor', () => {
	it('renders without error with empty props', () => {
		const container = document.createElement('div')
		const root = createRoot(container)
		expect(() => {
			act(() => {
				root.render(createElement(FlowcraftEditor, {}))
			})
		}).not.toThrow()
		root.unmount()
	})

	it('renders without error with blueprint and callback', () => {
		const onBlueprintChange = vi.fn()
		const container = document.createElement('div')
		const root = createRoot(container)
		expect(() => {
			act(() => {
				root.render(
					createElement(FlowcraftEditor, {
						blueprint: sampleBlueprint,
						onBlueprintChange,
					}),
				)
			})
		}).not.toThrow()
		root.unmount()
	})

	it('renders tldraw canvas', () => {
		const container = document.createElement('div')
		const root = createRoot(container)
		act(() => {
			root.render(createElement(FlowcraftEditor, {}))
		})
		expect(container.querySelector('[data-testid="tldraw-editor"]')).toBeTruthy()
		root.unmount()
	})
})
