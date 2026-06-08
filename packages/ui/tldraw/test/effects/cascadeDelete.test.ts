// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createCascadeDeleteEffect } from '../../src/effects/cascadeDelete'

describe('createCascadeDeleteEffect', () => {
	it('registers a beforeDeleteHandler and returns unsubscribe', () => {
		const deleteShapes = vi.fn()
		const registerBeforeDeleteHandler = vi.fn(() => () => {})
		const editor = {
			deleteShapes,
			getBindingsToShape: vi.fn(() => [{ fromId: 'conn-1' }, { fromId: 'conn-2' }]),
			sideEffects: { registerBeforeDeleteHandler },
		} as any

		const unsubscribe = createCascadeDeleteEffect(editor)
		expect(registerBeforeDeleteHandler).toHaveBeenCalledWith('shape', expect.any(Function))
		expect(typeof unsubscribe).toBe('function')
	})

	it('deletes bound connections when a node is deleted', () => {
		const deleteShapes = vi.fn()
		const registerBeforeDeleteHandler = vi.fn((_: string, handler: Function) => {
			handler({ id: 'node-1', type: 'flowcraft-node' })
			return () => {}
		})
		const editor = {
			deleteShapes,
			getBindingsToShape: vi.fn(() => [{ fromId: 'conn-1' }, { fromId: 'conn-2' }]),
			sideEffects: { registerBeforeDeleteHandler },
		} as any

		createCascadeDeleteEffect(editor)
		expect(deleteShapes).toHaveBeenCalledWith(['conn-1', 'conn-2'])
	})

	it('does nothing when there are no bound connections', () => {
		const deleteShapes = vi.fn()
		const registerBeforeDeleteHandler = vi.fn((_: string, handler: Function) => {
			handler({ id: 'node-1', type: 'flowcraft-node' })
			return () => {}
		})
		const editor = {
			deleteShapes,
			getBindingsToShape: vi.fn(() => []),
			sideEffects: { registerBeforeDeleteHandler },
		} as any

		createCascadeDeleteEffect(editor)
		expect(deleteShapes).not.toHaveBeenCalled()
	})
})
