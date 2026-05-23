import type { FlowcraftEvent, IEventBus } from 'flowcraft'

type EventType = FlowcraftEvent['type']
type EventOfType<T extends EventType> = Extract<FlowcraftEvent, { type: T }>
type Handler<T extends EventType> = (event: EventOfType<T>) => void

/**
 * A typed pub/sub event bus that satisfies flowcraft's IEventBus interface.
 *
 * Usage:
 *   const bus = new EventBus()
 *   const runtime = new FlowRuntime({ eventBus: bus, ... })
 *   bus.on('node:finish', (e) => updateShape(e.payload.nodeId, e.payload.result))
 */
export class EventBus implements IEventBus {
	private listeners = new Map<string, Handler<any>[]>()

	emit(event: FlowcraftEvent): void {
		const handlers = this.listeners.get(event.type) || []
		for (const handler of handlers) {
			handler(event)
		}
	}

	on<T extends EventType>(type: T, handler: Handler<T>): () => void {
		const existing = this.listeners.get(type) || []
		this.listeners.set(type, [...existing, handler])
		return () => {
			const list = this.listeners.get(type) || []
			this.listeners.set(
				type,
				list.filter((h) => h !== handler),
			)
		}
	}
}
