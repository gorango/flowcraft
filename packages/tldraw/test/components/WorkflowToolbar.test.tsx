// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkflowToolbar } from '../../src/components/WorkflowToolbar'

vi.mock('tldraw', () => ({
	createShapeId: vi.fn((id: string) => id),
}))

vi.mock('../../src/panels/NodeTypePicker', () => ({
	NodeTypePicker: ({ onSelect, onClose }: any) => {
		const div = createElement(
			'div',
			{ 'data-testid': 'node-type-picker' },
			createElement(
				'button',
				{
					type: 'button',
					'data-testid': 'select-fn',
					onClick: () =>
						onSelect({
							type: 'custom',
							label: 'Function',
							defaultParams: {},
							defaultInputs: {},
						}),
				},
				'Select Function',
			),
			createElement(
				'button',
				{
					type: 'button',
					'data-testid': 'close-picker',
					onClick: () => onClose(),
				},
				'Close Picker',
			),
		)
		return div
	},
}))

function render(
	editor: any = null,
	mode: 'select' | 'add-node' = 'select',
	onModeChange = vi.fn(),
) {
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => {
		root.render(createElement(WorkflowToolbar, { editor, mode, onModeChange }))
	})
	return { container, root, onModeChange }
}

describe('WorkflowToolbar', () => {
	it('renders the + Node button', () => {
		const { container, root } = render()
		expect(container.textContent).toContain('+ Node')
		root.unmount()
	})

	it('shows NodeTypePicker when + Node is clicked', () => {
		const { container, root } = render()
		const addBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === '+ Node',
		)!
		act(() => {
			addBtn.click()
		})
		const picker = container.querySelector('[data-testid="node-type-picker"]')
		expect(picker).toBeTruthy()
		root.unmount()
	})
})
