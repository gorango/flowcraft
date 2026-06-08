# Testing Patterns

## InMemoryEventLogger

A "flight recorder" that captures all workflow events for assertion:

```typescript
import { InMemoryEventLogger } from 'flowcraft/testing'

const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: eventLogger })

await runtime.run(blueprint, {})

// Get all events of a specific type
const events = eventLogger.getEvents('node:finish')

// Get all events
const allEvents = eventLogger.getAllEvents()

// Clear events for fresh assertions
eventLogger.clear()
```

### Event structure

Each `FlowcraftEvent` contains:

```typescript
interface FlowcraftEvent {
	type: string // e.g. 'node:finish', 'node:error', 'context:change'
	executionId: string
	blueprintId: string
	timestamp: number
	nodeId?: string // For node-specific events
	// Additional fields vary by event type
}
```

### Common assertions

```typescript
// Verify execution order
const order = eventLogger.getEvents('node:finish').map((e) => e.nodeId)
expect(order).toEqual(['step1', 'step2', 'step3'])

// Verify no errors occurred
expect(eventLogger.getEvents('node:error')).toHaveLength(0)

// Verify retry behavior
const retries = eventLogger.getEvents('node:retry')
expect(retries).toHaveLength(2)

// Verify context changes
const changes = eventLogger.getEvents('context:change')
expect(changes.some((e) => e.key === 'result')).toBe(true)

// Verify workflow completed
const finishEvents = eventLogger.getEvents('workflow:finish')
expect(finishEvents[0].status).toBe('completed')
```

## runWithTrace

Executes a workflow and prints a detailed execution trace on failure:

```typescript
import { runWithTrace } from 'flowcraft/testing'

const flow = createFlow('my-flow')
	.node('step1', async () => ({ output: 'data' }))
	.node('step2', async ({ input }) => ({ output: input.output }))
	.edge('step1', 'step2')

const runtime = new FlowRuntime()
const result = await runWithTrace(flow, runtime, { initial: 'value' })
```

**Trace output example:**

```
[step1] ✓ finished → { output: 'data' }
[step2] ✓ finished → { output: 'data' }
Workflow completed successfully
```

On failure, the trace shows exactly which node failed and with what error, making debugging much faster than raw stack traces.

## Stepper

Step-through execution for interactive debugging:

```typescript
import { Stepper } from 'flowcraft/testing'

const stepper = new Stepper()
const runtime = new FlowRuntime()

// Execution pauses before each node, waiting for stepper.next()
const resultPromise = runtime.run(
	blueprint,
	{},
	{
		middleware: [stepper.middleware()],
	},
)

// Step through nodes one at a time
await stepper.next() // Executes first ready node
await stepper.next() // Executes next ready node
await resultPromise // Resolves when workflow completes
```

## Testing best practices

### Test each code path

```typescript
// Test success path
test('processes order successfully', async () => {
	const eventLogger = new InMemoryEventLogger()
	const runtime = new FlowRuntime({ eventBus: eventLogger })

	const result = await runtime.run(orderBlueprint, {
		orderId: '123',
		items: [{ price: 10, qty: 2 }],
	})

	expect(result.status).toBe('completed')
	expect(result.context.get('payment')).toBeDefined()
})

// Test failure path
test('handles payment failure', async () => {
	const eventLogger = new InMemoryEventLogger()
	const runtime = new FlowRuntime({
		eventBus: eventLogger,
		registry: {
			chargePayment: () => {
				throw new Error('declined')
			},
		},
	})

	const result = await runtime.run(orderBlueprint, {
		orderId: '123',
		items: [{ price: 10, qty: 2 }],
	})

	expect(result.status).toBe('completed')
	expect(eventLogger.getEvents('node:error')).toHaveLength(1)
})
```

### Test with mocked dependencies

```typescript
test('calls external API with correct params', async () => {
	const mockApi = vi.fn().mockResolvedValue({ data: 'response' })
	const eventLogger = new InMemoryEventLogger()

	const runtime = new FlowRuntime({
		eventBus: eventLogger,
		registry: { callApi: mockApi },
	})

	await runtime.run(apiBlueprint, { url: '/test' })

	expect(mockApi).toHaveBeenCalledWith('/test')
})
```

### Test retry behavior

```typescript
test('retries failed node up to maxRetries', async () => {
	let attempts = 0
	const flakyNode = async () => {
		attempts++
		if (attempts < 3) throw new Error('temp failure')
		return { output: 'success' }
	}

	const flow = createFlow('retry-test').node('flaky', flakyNode, {
		config: { maxRetries: 3, retryDelay: 10 },
	})

	const eventLogger = new InMemoryEventLogger()
	const runtime = new FlowRuntime({ eventBus: eventLogger })
	const result = await runtime.run(flow.toBlueprint(), {})

	expect(result.status).toBe('completed')
	expect(attempts).toBe(3)
	expect(eventLogger.getEvents('node:retry')).toHaveLength(2)
})
```
