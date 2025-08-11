# Resilience & Error Handling

Real-world processes can fail. Network connections drop, APIs return errors, and unexpected conditions occur. Flowcraft provides a multi-layered approach for making your workflows resilient through automatic retries, fallback logic, and fatal error handling.

## How Errors are Handled

When an error is thrown inside a `Node`, Flowcraft wraps it in a `WorkflowError` object. This custom error provides additional context, including:

- `nodeName`: The name of the `Node` class where the error occurred.
- `phase`: The lifecycle phase (`'prep'`, `'exec'`, or `'post'`) where the error was thrown.
- `originalError`: The underlying error that was caught.

This ensures that you always know the precise location of a failure in your workflow. If an unhandled error occurs, it will propagate up and halt the entire `Flow`.

## 1. Automatic Retries

The most common way to handle transient failures (like a temporary network issue) is to simply retry the operation. You can configure this directly on any `Node` instance through its constructor options.

- `maxRetries`: The total number of times the `exec` phase will be attempted. A value of `1` (the default) means no retries. A value of `3` means one initial attempt and up to two retries.
- `wait`: The time in milliseconds to wait between retry attempts. Defaults to `0`.

> [!IMPORTANT]
> **Only the `exec` phase is retried.** Errors in `prep` or `post` are considered fatal for that node and will immediately cause a failure. This is by design, as these phases often involve state changes in the `Context` that might not be safe to repeat.

### Example: Retrying an API Call

```typescript
import { ConsoleLogger, Flow, Node, TypedContext } from 'flowcraft'

class FlakyApiNode extends Node {
	private attempts = 0

	constructor() {
		// Configure to try a total of 3 times, waiting 100ms between failures.
		super({ maxRetries: 3, wait: 100 })
	}

	async exec() {
		this.attempts++
		console.log(`Calling API, attempt #${this.attempts}...`)
		if (this.attempts < 3) {
			throw new Error('API is temporarily unavailable!')
		}
		console.log('API call successful!')
		return { data: 'some important data' }
	}
}

const flow = new Flow(new FlakyApiNode())
await flow.run(new TypedContext(), { logger: new ConsoleLogger() })
```

## 2. Fallback Logic

If all retries are exhausted and the `exec` phase still fails, you can provide a safety net by implementing the `execFallback` method. This method is only called if all `exec` attempts have failed.

The return value of `execFallback` is passed to the `post` phase just as a successful `exec` result would be. This allows your workflow to gracefully recover and continue, perhaps with default or cached data.

### Example: Using a Fallback

```typescript
import { ConsoleLogger, contextKey, Flow, Node, TypedContext } from 'flowcraft'

const DATA_KEY = contextKey<string>('data')

class ResilientApiNode extends Node<void, { data: string }> {
	constructor() {
		super({ maxRetries: 2 }) // Try twice
	}

	async exec() {
		console.log('Attempting to call the API...')
		throw new Error('API is down!')
	}

	async execFallback({ error }) {
		console.error(`All API attempts failed. Reason: ${error.message}`)
		console.log('Returning cached/default data as a fallback.')
		return { data: 'default fallback data' }
	}

	async post({ ctx, execRes }) {
		await ctx.set(DATA_KEY, execRes.data)
	}
}

const context = new TypedContext()
const flow = new Flow(new ResilientApiNode())
await flow.run(context, { logger: new ConsoleLogger() })

console.log(`Final data in context: ${await context.get(DATA_KEY)}`)
// Final data in context: default fallback data
```

## 3. Fatal Errors

Some failures are critical and non-recoverable. In these cases, you want the entire workflow to stop immediately, without attempting further retries or executing subsequent nodes. Flowcraft supports this with a special error type: `FatalWorkflowError`.

When a `FatalWorkflowError` is thrown, the executor will:
1.  **Bypass Retries and Fallbacks**: It will not re-run `exec` or call `execFallback`.
2.  **Halt Execution**: It will immediately stop processing and propagate the fatal error to the top-level `flow.run()` caller.

### Example: Validating Critical Data

```typescript
import { FatalWorkflowError, Flow, Node } from 'flowcraft'

class ValidatePayloadNode extends Node {
	async exec({ params }) {
		if (!params.userId) {
			throw new FatalWorkflowError(
				'Payload validation failed: Missing userId.',
				this.constructor.name,
				'exec'
			)
		}
		return params
	}
}

class ProcessDataNode extends Node {
	async exec() { console.log('This should never run.') }
}

const flow = new Flow(new ValidatePayloadNode().next(new ProcessDataNode()))

try {
	await flow.withParams({ invalid: 'payload' }).run(new TypedContext())
}
catch (error) {
	if (error instanceof FatalWorkflowError) {
		console.error(`Workflow halted with fatal error: ${error.message}`)
	}
}
// Logs: Workflow halted with fatal error: Payload validation failed: Missing userId.
```
