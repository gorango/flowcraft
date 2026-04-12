import type { FlowcraftEvent, IEventBus } from 'flowcraft'

type EventType = FlowcraftEvent['type']
type EventOfType<T extends EventType> = Extract<FlowcraftEvent, { type: T }>
type Handler<T extends EventType> = (event: EventOfType<T>) => void

/**
 * A typed pub/sub event bus that satisfies flowcraft's IEventBus interface.
 *
 * FlowRuntime only requires `emit`, but we extend it with a typed `on` method
 * so React components can subscribe to individual event types without needing
 * a separate listener infrastructure.
 *
 * Usage:
 *   const bus = new EventBus()
 *   const runtime = new FlowRuntime({ eventBus: bus, ... })
 *   bus.on('node:finish', (e) => console.log(e.payload.nodeId))
 */
export class EventBus implements IEventBus {
	private listeners = new Map<string, Handler<any>[]>()

	emit(event: FlowcraftEvent): void {
		const handlers = this.listeners.get(event.type) || []
		handlers.forEach((h) => h(event))
	}

	/** Subscribe to a specific event type. Returns an unsubscribe function. */
	on<T extends EventType>(type: T, handler: Handler<T>): () => void {
		const existing = this.listeners.get(type) || []
		this.listeners.set(type, [...existing, handler])
		return () => {
			const list = this.listeners.get(type) || []
			this.listeners.set(type, list.filter((h) => h !== handler))
		}
	}
}
