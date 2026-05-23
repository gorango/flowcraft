// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from 'tldraw'
import { EdgeConfigPanel } from '../../src/panels/EdgeConfigPanel'

vi.mock('tldraw', () => ({
	ShapeUtil: class {
		editor: any
		constructor(editor: any) {
			this.editor = editor
		}
	},
}))

interface ArrowShapeStub {
	id: string
	type: string
	meta?: Record<string, any>
	props?: Record<string, any>
}

function createMockEditor(shape: ArrowShapeStub | null): Editor {
	return {
		getShape: vi.fn(() => shape),
		updateShape: vi.fn(),
	} as unknown as Editor
}

function setNativeValue(el: HTMLInputElement, value: string) {
	const prototype = Object.getPrototypeOf(el)
	const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
	nativeSetter.call(el, value)
	el.dispatchEvent(new Event('input', { bubbles: true }))
}

function render(editor: Editor, shapeId: string | null, onClose = vi.fn()) {
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => {
		root.render(createElement(EdgeConfigPanel, { editor, shapeId, onClose }))
	})
	return { container, root, onClose }
}

describe('EdgeConfigPanel', () => {
	it('shows placeholder when shapeId is null', () => {
		const editor = createMockEditor(null)
		const { container, root } = render(editor, null)

		expect(container.textContent).toContain('Select an edge to edit')

		root.unmount()
	})

	it('shows placeholder when shape is not found', () => {
		const editor = createMockEditor(null)
		const { container, root } = render(editor, 'some-arrow')

		expect(container.textContent).toContain('Select an edge to edit')

		root.unmount()
	})

	it('shows placeholder when shape type is not arrow', () => {
		const editor = createMockEditor({ id: 's1', type: 'flowcraft-node' })
		const { container, root } = render(editor, 's1')

		expect(container.textContent).toContain('Select an edge to edit')

		root.unmount()
	})

	it('renders form fields populated from arrow meta edgeDef', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: {
				edgeDef: {
					action: 'onSuccess',
					condition: '{{ok}}',
					transform: '{{body}}',
				},
			},
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'arrow-1')

		const inputs = container.querySelectorAll('input')
		expect(inputs[0]?.value).toBe('onSuccess')
		expect(inputs[1]?.value).toBe('{{ok}}')
		expect(inputs[2]?.value).toBe('{{body}}')

		root.unmount()
	})

	it('renders empty fields when edgeDef has no properties', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: {} },
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'arrow-1')

		const inputs = container.querySelectorAll('input')
		for (const input of inputs) {
			expect(input.value).toBe('')
		}

		root.unmount()
	})

	it('renders empty fields when meta has no edgeDef', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: {},
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'arrow-1')

		const inputs = container.querySelectorAll('input')
		for (const input of inputs) {
			expect(input.value).toBe('')
		}

		root.unmount()
	})

	it('calls editor.updateShape with only non-empty fields on save', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: { action: 'onSuccess', condition: '{{ok}}' } },
		}
		const editor = createMockEditor(shape)
		const { container, root, onClose } = render(editor, 'arrow-1')

		const [actionInput, conditionInput] = container.querySelectorAll('input')
		act(() => {
			setNativeValue(actionInput, 'onReject')
		})
		act(() => {
			setNativeValue(conditionInput, '')
		})

		const saveBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Save',
		)!
		act(() => {
			saveBtn.click()
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: { action: 'onReject' } },
		})
		expect(onClose).toHaveBeenCalled()

		root.unmount()
	})

	it('omits fields that are still empty from saved meta', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: {} },
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'arrow-1')

		const saveBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Save',
		)!
		act(() => {
			saveBtn.click()
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: {} },
		})

		root.unmount()
	})

	it('close button calls onClose', () => {
		const shape: ArrowShapeStub = {
			id: 'arrow-1',
			type: 'arrow',
			meta: { edgeDef: { action: 'go' } },
		}
		const editor = createMockEditor(shape)
		const { container, root, onClose } = render(editor, 'arrow-1')

		const closeBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === '✕',
		)!
		act(() => {
			closeBtn.click()
		})

		expect(onClose).toHaveBeenCalled()

		root.unmount()
	})
})
