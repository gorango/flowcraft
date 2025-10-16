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

To configure a fallback, specify the ID of another node in the `fallback` property of the `config` object.

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

For class-based nodes extending `BaseNode`, you can implement a `recover` method to perform cleanup when non-retriable errors occur outside the main `exec` phase (e.g., in `prep`, `post`, or due to fatal errors). This ensures resources like database connections or locks are properly released.

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

Flowcraft uses custom error types to give you more control over failure modes:

-   **`NodeExecutionError`**: The standard error thrown when a node fails after all retries.
-   **`FatalNodeExecutionError`**: A special error you can throw from your node logic. When the runtime catches this, it will **not** attempt any retries or fallbacks and will fail the workflow immediately. This is for unrecoverable errors.
-   **`CancelledWorkflowError`**: Thrown when a workflow is gracefully cancelled via an `AbortSignal`.
