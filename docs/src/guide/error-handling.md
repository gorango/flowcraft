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

Here is a live example demonstrating a node that fails twice before succeeding on its third retry.

<DemoRetry />

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

You can visualize and run this workflow:

<DemoFallback />

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

## Source-Mapped Runtime Errors

Flowcraft provides a utility to translate runtime errors that reference blueprint node IDs into user-friendly errors that point to the original TypeScript source code. This helps developers quickly identify where in their code a workflow error originated.

### `createErrorMapper`

The `createErrorMapper` function creates an error mapping utility that enhances runtime errors with source location information from the compiled manifest.

#### Usage

```typescript
import { createErrorMapper } from 'flowcraft'
import { blueprints } from './dist/flowcraft.manifest.js'

const mapError = createErrorMapper(blueprints)

try {
  await runtime.run(blueprint, ...)
} catch (e) {
  // Enhance the error with source location
  throw mapError(e)
}
```

#### How It Works

1. **Pre-processing**: The mapper builds a lookup table from the compiled manifest, mapping node IDs to their source locations (`file`, `line`, `column`).

2. **Error Enhancement**: When an error occurs, the mapper:
   - Checks if the error is a `FlowcraftError` with a `nodeId` property
   - Falls back to extracting node IDs from error messages using regex patterns
   - Looks up the source location for the identified node
   - Returns a new error with the source location prepended to the original message

3. **Fallback**: If no node ID can be identified or no source location is found, the original error is returned unchanged.

#### Example Output

**Before** (runtime error):
```
FlowcraftError: Node execution failed: database connection timeout
```

**After** (source-mapped error):
```
Error: Workflow error at /app/src/workflows/user-flow.ts:42:8. Original error: Node execution failed: database connection timeout
```

This allows developers to quickly navigate to the exact line in their TypeScript source code where the workflow logic that caused the error is defined.
