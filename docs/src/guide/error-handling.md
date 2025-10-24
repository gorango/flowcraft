# Error Handling

Building reliable workflows requires a robust strategy for handling failures. Flowcraft provides built-in mechanisms for resilience, including retries and fallbacks.

## Retries

You can configure a node to automatically retry its `exec()` method if it fails. This is useful for transient errors, like network timeouts or temporary API unavailability.

To configure retries, add a `config` object to your node definition with `maxRetries`.

```typescript
let attempts = 0

const flow = createFlow('retry-workflow')
	.node('risky-operation', async () => {
		attempts++
		console.log(`Attempt #${attempts}...`)
		if (attempts < 3) {
			throw new Error('Temporary failure!')
		}
		return { output: 'Succeeded on attempt 3' }
	}, {
		config: {
			// The node will be executed up to 3 times in total.
			maxRetries: 3
		}
	})
	.toBlueprint()
```

When this workflow runs, the `risky-operation` node will fail twice and then succeed on its third and final attempt.

## Fallbacks

If a node fails all of its retry attempts, you can define a **fallback** node to execute as a recovery mechanism. This allows you to handle the failure gracefully instead of letting the entire workflow fail.

To configure a fallback, specify the ID of another node in the `fallback` property of the `config` object. The runtime will automatically route to the fallback node if the primary node fails after retries.

```typescript
const flow = createFlow('fallback-workflow')
	.node('primary-api', async () => {
		// This will always fail
		throw new Error('Primary API is down')
	}, {
		config: {
			maxRetries: 2,
			fallback: 'secondary-api' // If 'primary-api' fails, run this node.
		}
	})
	.node('secondary-api', async () => {
		console.log('Executing fallback to secondary API...')
		return { output: 'Data from secondary API' }
	})
	.node('process-data', async ({ input }) => {
		// This node will receive the output from whichever predecessor ran.
		return { output: `Processed: ${input}` }
	})
	// Edges from both the primary and fallback nodes
	.edge('primary-api', 'process-data')
	.edge('secondary-api', 'process-data')
	.toBlueprint()
```

In this example:
1. `primary-api` will be attempted twice and will fail both times.
2. The runtime will then execute the `secondary-api` node as a fallback.
3. The output of `secondary-api` will be passed to `process-data`.
4. The workflow completes successfully, with the final context containing the output from the fallback path.

## Cleanup with `recover`

For class-based nodes extending [`BaseNode`](/api/nodes-and-edges#basenode-abstract-class), you can implement a `recover` method to perform cleanup when non-retriable errors occur outside the main `exec` phase (e.g., in `prep`, `post`, or due to fatal errors). This ensures resources like database connections or locks are properly released.

```typescript
import { BaseNode, NodeContext, NodeResult } from 'flowcraft'

class DatabaseNode extends BaseNode {
  private connection: any // Mock database connection

  async prep(context: NodeContext) {
    this.connection = await openDatabaseConnection()
    return { /* prep data */ }
  }

  async exec(prepResult: any, context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
    // Core logic using this.connection
    return { output: 'data' }
  }

  async recover(error: Error, context: NodeContext): Promise<void> {
    if (this.connection) {
      await this.connection.close()
      console.log('Database connection closed due to error')
    }
  }
}
```

The `recover` method is called in a `finally` block, ensuring cleanup even if the node fails fatally.

## Custom Error Types

Flowcraft uses a centralized error handling system with `FlowcraftError` to provide consistent and debuggable error information. This replaces the previous custom error classes for better maintainability and debugging.

### `FlowcraftError`

The primary error class for all workflow-related failures. Use this for throwing errors from your nodes or handling failures in the runtime.

#### Key Features:
- **Unified Structure**: All errors have the same shape with optional metadata.
- **Cause Chaining**: Uses the standard `cause` property for proper error chaining.
- **Fatal vs Non-Fatal**: The `isFatal` flag controls whether the workflow should halt immediately.
- **Rich Metadata**: Includes `nodeId`, `blueprintId`, and `executionId` for debugging.

#### Usage in Nodes:

```typescript
// Non-fatal error with cause
throw new FlowcraftError('API call failed', {
  cause: originalError,
  nodeId: 'my-node',
  blueprintId: 'my-blueprint',
  executionId: 'exec-123',
  isFatal: false,
});

// Fatal error (halts workflow immediately)
throw new FlowcraftError('Critical system failure', {
  nodeId: 'critical-node',
  isFatal: true,
});
```

#### Enhanced Subflow Error Propagation

When a subflow fails, the error is wrapped in a `FlowcraftError` that includes detailed information from the subflow's execution. This helps with debugging by providing:

- The original error message from the failed node within the subflow
- The node ID where the failure occurred in the subflow
- The stack trace from the subflow's execution

This ensures that failures in nested workflows are traceable back to their source, making it easier to diagnose issues in complex workflow hierarchies.

## Observability and Events

Flowcraft provides an event bus for observability, allowing you to monitor workflow execution in real-time. The runtime emits various events during execution, which can be used for logging, monitoring, or triggering external actions.

### Available Events

The event bus uses structured events for observability. See the [`FlowcraftEvent`](/api/runtime#flowcraftevent-type) type definition and detailed descriptions of all available events.

### Event Descriptions

- **`workflow:start`**: Emitted when a workflow execution begins.
- **`workflow:finish`**: Emitted when a workflow completes, fails, or is cancelled.
- **`workflow:stall`**: Emitted when a workflow cannot proceed (e.g., due to unresolved dependencies).
- **`workflow:pause`**: Emitted when a workflow is paused (e.g., due to cancellation or stalling).
- **`workflow:resume`**: Emitted when a workflow resumes execution.
- **`node:start`**: Emitted when a node begins execution, including the resolved input.
- **`node:finish`**: Emitted when a node completes successfully.
- **`node:error`**: Emitted when a node fails.
- **`node:fallback`**: Emitted when a fallback node is executed.
- **`node:retry`**: Emitted when a node execution is retried.
- **`node:skipped`**: Emitted when a conditional edge is not taken.
- **`edge:evaluate`**: Emitted when an edge condition is evaluated, showing the condition and result.
- **`context:change`**: Emitted when data is written to the workflow context.
- **`batch:start`**: Emitted when a batch operation begins.
- **`batch:finish`**: Emitted when a batch operation completes.

### Using the Event Bus

You can provide a custom event bus when creating the runtime:

```typescript
import type { IEventBus } from 'flowcraft'

const eventBus: IEventBus = {
  async emit(event) {
    console.log(`Event: ${event.type}`, event.payload)
    // Send to monitoring service, etc.
  }
}

const runtime = new FlowRuntime({
  registry: myNodeRegistry,
  eventBus,
})
```

For the complete `FlowcraftEvent` type definition, see the [Runtime API documentation](/api/runtime#event-bus).

This allows you to integrate with tools like OpenTelemetry, DataDog, or custom logging systems for comprehensive observability.
