// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { NodeTypePicker } from '../../src/panels/NodeTypePicker'
import type { NodeTypeDefinition } from '../../src/registry/nodeTypes'

vi.mock('../../src/registry/nodeTypes', () => ({
	getCategoryDefinitions: vi.fn(() => {
		const cats = new Map<string, NodeTypeDefinition[]>()
		cats.set('execution', [
			{
				type: 'custom',
				label: 'Function',
				description: 'A custom function node',
				category: 'execution',
				inputs: [],
				outputs: [],
				defaultParams: {},
				defaultInputs: {},
				schema: {},
			},
			{
				type: 'sleep',
				label: 'Sleep',
				description: 'Pause execution for a duration',
				category: 'execution',
				inputs: [{ id: 'in', type: 'input', label: 'in' }],
				outputs: [{ id: 'out', type: 'output', label: 'out' }],
				defaultParams: {},
				defaultInputs: {},
				schema: {},
			},
		])
		cats.set('control', [
			{
				type: 'loop-controller',
				label: 'Loop Controller',
				description: 'Loops over a batch',
				category: 'control',
				inputs: [],
				outputs: [],
				defaultParams: {},
				defaultInputs: {},
				schema: {},
			},
		])
		return cats
	}),
}))

function render(onSelect = vi.fn(), onClose = vi.fn()) {
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => {
		root.render(createElement(NodeTypePicker, { onSelect, onClose }))
	})
	return { container, root, onSelect, onClose }
}

describe('NodeTypePicker', () => {
	it('renders node types grouped by category', () => {
		const { container, root } = render()
		expect(container.textContent).toContain('Function')
		expect(container.textContent).toContain('Sleep')
		expect(container.textContent).toContain('Loop Controller')
		expect(container.textContent).toContain('execution')
		expect(container.textContent).toContain('control')
		root.unmount()
	})

	it('filters nodes by search query', () => {
		const { container, root } = render()
		const input = container.querySelector('input')!
		act(() => {
			const nativeSetter = Object.getOwnPropertyDescriptor(
				Object.getPrototypeOf(input),
				'value',
			)!.set!
			nativeSetter.call(input, 'sleep')
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
		expect(container.textContent).toContain('Sleep')
		expect(container.textContent).not.toContain('Function')
		root.unmount()
	})

	it('shows "No matching nodes" when search has no matches', () => {
		const { container, root } = render()
		const input = container.querySelector('input')!
		act(() => {
			const nativeSetter = Object.getOwnPropertyDescriptor(
				Object.getPrototypeOf(input),
				'value',
			)!.set!
			nativeSetter.call(input, 'zzzznonexistent')
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
		expect(container.textContent).toContain('No matching nodes')
		root.unmount()
	})

	it('calls onSelect when a node type button is clicked', () => {
		const onSelect = vi.fn()
		const { container, root } = render(onSelect)
		const functionBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Function'),
		)!
		act(() => {
			functionBtn.click()
		})
		expect(onSelect).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'custom', label: 'Function' }),
		)
		root.unmount()
	})

	it('calls onClose when close button is clicked', () => {
		const onClose = vi.fn()
		const { container, root } = render(vi.fn(), onClose)
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
