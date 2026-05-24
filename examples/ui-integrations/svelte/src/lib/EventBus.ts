import type { FlowcraftEvent, IEventBus } from 'flowcraft'

type EventType = FlowcraftEvent['type']
type EventOfType<T extends EventType> = Extract<FlowcraftEvent, { type: T }>
type Handler<T extends EventType> = (event: EventOfType<T>) => void

export class EventBus implements IEventBus {
	private listeners = new Map<string, Handler<any>[]>()

	emit(event: FlowcraftEvent): void {
		const handlers = this.listeners.get(event.type) || []
		handlers.forEach((h) => h(event))
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
