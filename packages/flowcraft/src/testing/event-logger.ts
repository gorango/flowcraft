import type { FlowcraftEvent, IEventBus } from '../types'

/**
 * A test utility that implements IEventBus to capture all workflow events
 * in memory, acting as a "flight recorder" for behavioral testing.
 *
 * @example
 * // In your test file (e.g., resiliency.test.ts)
 * it('should retry a node on failure', async () => {
 *   const eventLogger = new InMemoryEventLogger();
 *   const runtime = new FlowRuntime({ eventBus: eventLogger });
 *
 *   const flow = createFlow('retry-flow')
 *     .node('api-call', vi.fn().mockRejectedValueOnce(new Error('fail')), {
 *       config: { maxRetries: 2 },
 *     });
 *
 *   await runtime.run(flow.toBlueprint());
 *
 *   // Assert against the captured event history to prove behavior.
 *   const retryEvents = eventLogger.filter('node:retry');
 *   expect(retryEvents).toHaveLength(1); // The first attempt is not a "retry"
 * });
 */
export class InMemoryEventLogger implements IEventBus {
	public readonly events: FlowcraftEvent[] = []

	/**
	 * Clears all captured events.
	 */
	public clear(): void {
		this.events.length = 0
	}

	/**
	 * The `emit` method required by the IEventBus interface.
	 * It simply pushes the received event into the internal events array.
	 * @param event The FlowcraftEvent to record.
	 */
	public async emit(event: FlowcraftEvent): Promise<void> {
		this.events.push(event)
	}

	/**
	 * Finds the first event of a specific type.
	 * @param type The event type to find (e.g., 'node:error').
	 * @returns The first matching event, or undefined if not found.
	 */
	public find<T extends FlowcraftEvent['type']>(type: T): Extract<FlowcraftEvent, { type: T }> | undefined {
		return this.events.find((e) => e.type === type) as Extract<FlowcraftEvent, { type: T }> | undefined
	}

	/**
	 * Filters events to find all occurrences of a specific type.
	 * @param type The event type to filter by.
	 * @returns An array of matching events.
	 */
	public filter<T extends FlowcraftEvent['type']>(type: T): Extract<FlowcraftEvent, { type: T }>[] {
		return this.events.filter((e) => e.type === type) as Extract<FlowcraftEvent, { type: T }>[]
	}

	/**
	 * Prints a formatted log of all captured events to the console.
	 * Ideal for debugging failing tests.
	 * @param title A title for the log output.
	 */
	public printLog(title = 'Workflow Execution Trace'): void {
		console.log(`\n--- ${title} ---`)
		if (this.events.length === 0) {
			console.log('No events were captured.')
			console.log('----------------------------------\n')
			return
		}

		this.events.forEach((event, index) => {
			const { type, payload } = event
			console.log(`\n[${index + 1}] ${type}`)

			// Custom formatting for a more intuitive trace
			switch (type) {
				case 'node:start':
					console.log(`  - Node: "${payload.nodeId}" | Input: ${JSON.stringify(payload.input)}`)
					break
				case 'edge:evaluate':
					console.log(`  - Edge: "${payload.source}" -> "${payload.target}"`)
					console.log(`  - Condition: ${payload.condition || 'N/A'} | Result: ${payload.result}`)
					break
				case 'context:change':
					console.log(
						`  - Node "${payload.sourceNode}" wrote to context -> Key: "${payload.key}" | Value: ${JSON.stringify(payload.value)}`,
					)
					break
				case 'node:finish':
					console.log(`  - Node: "${payload.nodeId}" | Result: ${JSON.stringify(payload.result)}`)
					break
				case 'node:error':
					console.log(`  - Node: "${payload.nodeId}"`)
					console.error('  - Error:', payload.error)
					break
				default:
					console.log(`  - Payload: ${JSON.stringify(payload, null, 2)}`)
			}
		})
		console.log(`\n--- End of Trace ---`)
	}
}
