import type { FlowcraftEvent, IEventBus } from 'flowcraft'

export class InMemoryEventBus implements IEventBus {
	private listeners: Map<string, ((event: FlowcraftEvent) => void)[]> = new Map()

	emit(event: FlowcraftEvent): void {
		const eventListeners = this.listeners.get(event.type) || []
		eventListeners.forEach((listener) => listener(event))
	}

	on(eventType: string, listener: (event: FlowcraftEvent) => void): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, [])
		}
		this.listeners.get(eventType)!.push(listener)
		return () => {
			const list = this.listeners.get(eventType)
			if (list) {
				const idx = list.indexOf(listener)
				if (idx > -1) list.splice(idx, 1)
			}
		}
	}

	off(eventType: string, listener: (event: FlowcraftEvent) => void): void {
		const eventListeners = this.listeners.get(eventType)
		if (eventListeners) {
			const index = eventListeners.indexOf(listener)
			if (index > -1) {
				eventListeners.splice(index, 1)
			}
		}
	}
}
