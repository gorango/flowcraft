// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from 'tldraw'
import { NodeConfigPanel } from '../../src/panels/NodeConfigPanel'

vi.mock('tldraw', () => ({
	ShapeUtil: class {
		editor: any
		constructor(editor: any) {
			this.editor = editor
		}
	},
}))

interface ShapeStub {
	id: string
	type: string
	props: {
		nodeDef: {
			id: string
			uses: string
			params?: Record<string, any>
			inputs?: string | Record<string, string>
			config?: Record<string, any>
		}
	}
}

function createMockEditor(shape: ShapeStub | null): Editor {
	return {
		getShape: vi.fn(() => shape),
		updateShape: vi.fn(),
	} as unknown as Editor
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	const prototype = Object.getPrototypeOf(el)
	const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
	nativeSetter.call(el, value)
	el.dispatchEvent(new Event('input', { bubbles: true }))
}

function render(editor: Editor, shapeId: string | null, onClose = vi.fn()) {
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => {
		root.render(createElement(NodeConfigPanel, { editor, shapeId, onClose }))
	})
	return { container, root, onClose }
}

describe('NodeConfigPanel', () => {
	it('shows placeholder when shapeId is null', () => {
		const editor = createMockEditor(null)
		const { container, root } = render(editor, null)

		expect(container.textContent).toContain('Select a node to edit')

		root.unmount()
	})

	it('shows placeholder when shape is not found', () => {
		const editor = createMockEditor(null)
		const { container, root } = render(editor, 'some-id')

		expect(container.textContent).toContain('Select a node to edit')

		root.unmount()
	})

	it('renders form fields populated from shape nodeDef', () => {
		const shape: ShapeStub = {
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: {
				nodeDef: {
					id: 'my-node',
					uses: 'http-request',
					params: { timeout: 5000 },
					inputs: 'context.url',
				},
			},
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'shape:n1')

		const inputs = container.querySelectorAll('input')
		const textareas = container.querySelectorAll('textarea')

		expect(inputs[0]?.value).toBe('my-node')
		expect(inputs[1]?.value).toBe('http-request')

		const paramTextarea = textareas[0] as HTMLTextAreaElement
		expect(paramTextarea.value).toBe(JSON.stringify({ timeout: 5000 }, null, 2))

		const inputsTextarea = textareas[1] as HTMLTextAreaElement
		expect(inputsTextarea.value).toBe('context.url')

		root.unmount()
	})

	it('calls editor.updateShape and onClose on save', () => {
		const shape: ShapeStub = {
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: {
				nodeDef: {
					id: 'my-node',
					uses: 'http-request',
				},
			},
		}
		const editor = createMockEditor(shape)
		const { container, root, onClose } = render(editor, 'shape:n1')

		const [idInput, usesInput] = container.querySelectorAll('input')

		act(() => {
			setNativeValue(idInput, 'updated-node')
		})
		act(() => {
			setNativeValue(usesInput, 'custom-node')
		})

		const saveBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Save',
		)!
		act(() => {
			saveBtn.click()
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: {
				nodeDef: {
					id: 'updated-node',
					uses: 'custom-node',
					params: undefined,
					inputs: undefined,
					config: undefined,
				},
			},
		})
		expect(onClose).toHaveBeenCalled()

		root.unmount()
	})

	it('renders params as JSON when nodeDef has params object', () => {
		const shape: ShapeStub = {
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: {
				nodeDef: {
					id: 'n1',
					uses: 'a',
					params: { key: 'value', num: 42 },
				},
			},
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'shape:n1')

		const textareas = container.querySelectorAll('textarea')
		const paramsTextarea = textareas[0] as HTMLTextAreaElement
		expect(paramsTextarea.value).toContain('"key"')
		expect(paramsTextarea.value).toContain('"value"')
		expect(paramsTextarea.value).toContain('42')

		root.unmount()
	})

	it('renders inputs as JSON when nodeDef.inputs is an object', () => {
		const shape: ShapeStub = {
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: {
				nodeDef: {
					id: 'n1',
					uses: 'a',
					inputs: { url: 'context.url', method: '"GET"' },
				},
			},
		}
		const editor = createMockEditor(shape)
		const { container, root } = render(editor, 'shape:n1')

		const textareas = container.querySelectorAll('textarea')
		const inputsTextarea = textareas[1] as HTMLTextAreaElement
		expect(inputsTextarea.value).toContain('"url"')
		expect(inputsTextarea.value).toContain('"method"')

		root.unmount()
	})

	it('close button calls onClose', () => {
		const shape: ShapeStub = {
			id: 'shape:n1',
			type: 'flowcraft-node',
			props: { nodeDef: { id: 'n1', uses: 'a' } },
		}
		const editor = createMockEditor(shape)
		const { container, root, onClose } = render(editor, 'shape:n1')

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
