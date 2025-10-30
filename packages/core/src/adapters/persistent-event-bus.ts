import type { FlowcraftEvent, IEventBus } from '../types'

/**
 * Interface for a persistent storage mechanism for events.
 * Implementations can store events in databases, log streams, files, etc.
 */
export interface IEventStore {
	/**
	 * Store an event persistently.
	 * @param event The event to store
	 * @param executionId The execution ID for grouping events
	 */
	store(event: FlowcraftEvent, executionId: string): Promise<void>

	/**
	 * Retrieve all events for a specific execution.
	 * @param executionId The execution ID
	 * @returns Array of events in chronological order
	 */
	retrieve(executionId: string): Promise<FlowcraftEvent[]>

	/**
	 * Retrieve events for multiple executions.
	 * @param executionIds Array of execution IDs
	 * @returns Map of execution ID to array of events
	 */
	retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>>
}

/**
 * A pluggable event bus adapter that persists all workflow events
 * to a configurable storage backend, enabling time-travel debugging and replay.
 *
 * @example
 * ```typescript
 * // Using a database-backed store
 * const eventStore = new DatabaseEventStore(dbConnection)
 * const eventBus = new PersistentEventBusAdapter(eventStore)
 * const runtime = new FlowRuntime({ eventBus })
 *
 * // Later, replay the execution
 * const events = await eventStore.retrieve(executionId)
 * const finalState = await runtime.replay(blueprint, events)
 * ```
 */
export class PersistentEventBusAdapter implements IEventBus {
	constructor(private store: IEventStore) {}

	/**
	 * Emit an event by storing it persistently.
	 * Also emits to console for debugging (can be made configurable).
	 */
	async emit(event: FlowcraftEvent): Promise<void> {
		let executionId = 'unknown'
		if ('executionId' in event.payload) {
			executionId = event.payload.executionId as string
		}
		await this.store.store(event, executionId)
	}
}

/**
 * Simple in-memory event store for testing and development.
 * Not suitable for production use.
 */
export class InMemoryEventStore implements IEventStore {
	private events = new Map<string, FlowcraftEvent[]>()

	async store(event: FlowcraftEvent, executionId: string): Promise<void> {
		if (!this.events.has(executionId)) {
			this.events.set(executionId, [])
		}
		this.events.get(executionId)?.push(event)
	}

	async retrieve(executionId: string): Promise<FlowcraftEvent[]> {
		return this.events.get(executionId) || []
	}

	async retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>> {
		const result = new Map<string, FlowcraftEvent[]>()
		for (const id of executionIds) {
			result.set(id, await this.retrieve(id))
		}
		return result
	}

	/**
	 * Clear all stored events (useful for testing).
	 */
	clear(): void {
		this.events.clear()
	}
}
