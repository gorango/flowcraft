import { describe, expect, it, vi } from 'vitest'
import type { FlowcraftEvent } from 'flowcraft'
import { FlowcraftError } from 'flowcraft'
import { EventBus } from '../../src/sync/EventBus'

describe('EventBus', () => {
	it('emit dispatches to handler registered via on', () => {
		const bus = new EventBus()
		const handler = vi.fn()

		bus.on('node:start', handler)
		const event: FlowcraftEvent = {
			type: 'node:start',
			payload: { nodeId: 'a', executionId: 'e1', input: {}, blueprintId: 'bp1' },
		}
		bus.emit(event)

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(event)
	})

	it('emit does not call handlers for other event types', () => {
		const bus = new EventBus()
		const handler = vi.fn()

		bus.on('node:finish', handler)
		bus.emit({
			type: 'node:start',
			payload: { nodeId: 'a', executionId: 'e1', input: {}, blueprintId: 'bp1' },
		})

		expect(handler).not.toHaveBeenCalled()
	})

	it('emit calls multiple handlers for the same event type', () => {
		const bus = new EventBus()
		const h1 = vi.fn()
		const h2 = vi.fn()

		bus.on('workflow:finish', h1)
		bus.on('workflow:finish', h2)
		bus.emit({
			type: 'workflow:finish',
			payload: { blueprintId: 'bp1', executionId: 'e1', status: 'completed' },
		})

		expect(h1).toHaveBeenCalledTimes(1)
		expect(h2).toHaveBeenCalledTimes(1)
	})

	it('unsubscribe returned by on removes the handler', () => {
		const bus = new EventBus()
		const handler = vi.fn()

		const unsubscribe = bus.on('node:error', handler)
		unsubscribe()

		bus.emit({
			type: 'node:error',
			payload: {
				nodeId: 'a',
				error: new FlowcraftError('nope'),
				executionId: 'e1',
				blueprintId: 'bp1',
			},
		})

		expect(handler).not.toHaveBeenCalled()
	})

	it('unsubscribe only removes its own handler', () => {
		const bus = new EventBus()
		const h1 = vi.fn()
		const h2 = vi.fn()

		bus.on('node:start', h1)
		const unsub = bus.on('node:start', h2)
		unsub()

		const event: FlowcraftEvent = {
			type: 'node:start',
			payload: { nodeId: 'a', executionId: 'e1', input: {}, blueprintId: 'bp1' },
		}
		bus.emit(event)

		expect(h1).toHaveBeenCalledTimes(1)
		expect(h2).not.toHaveBeenCalled()
	})
})
