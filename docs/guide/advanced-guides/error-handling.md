# Advanced Guide: Error Handling

Real-world processes can fail. Network connections drop, APIs return errors, and unexpected conditions occur. Cascade provides built-in mechanisms for making your workflows resilient through automatic retries and fallback logic.

## How Errors are Handled

When an error is thrown inside a `Node`, Cascade wraps it in a `WorkflowError` object. This custom error provides additional context, including:

- `nodeName`: The name of the `Node` class where the error occurred.
- `phase`: The lifecycle phase (`'prep'`, `'exec'`, or `'post'`) where the error was thrown.
- `originalError`: The underlying error that was caught.

This ensures that you always know the precise location of a failure in your workflow.

If an unhandled error occurs (meaning there is no fallback logic), it will propagate up and halt the entire `Flow`.

## Automatic Retries

The most common way to handle transient failures (like a temporary network issue) is to simply retry the operation. You can configure this directly on any `Node` instance through its constructor options.

### `maxRetries` and `wait`

- `maxRetries`: The total number of times the `exec` phase will be attempted. A value of `1` (the default) means no retries. A value of `3` means one initial attempt and up to two retries.
- `wait`: The time in milliseconds to wait between retry attempts. Defaults to `0`.

**Important**: Only the `exec` phase of a node is retried. Errors in `prep` or `post` are considered fatal for that node and will immediately cause a failure. This is by design, as these phases often involve state changes in the `Context` that might not be safe to repeat.

### Example: Retrying an API Call

Let's create a node that simulates a flaky API call and configure it to retry.

```typescript
import { Node, Flow, TypedContext, ConsoleLogger } from 'cascade'

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
// We'll use a ConsoleLogger to see the retry warnings.
await flow.run(new TypedContext(), { logger: new ConsoleLogger() })
```

The output will look like this, demonstrating the retry logic:

```
[INFO] Running node: FlakyApiNode
Calling API, attempt #1...
[WARN] Attempt 1/3 failed for FlakyApiNode. Retrying...
Calling API, attempt #2...
[WARN] Attempt 2/3 failed for FlakyApiNode. Retrying...
Calling API, attempt #3...
API call successful!
```

## Fallback Logic

What happens if all retries are exhausted and the `exec` phase still fails? By default, the node throws an error. However, you can provide a safety net by implementing the `execFallback` method.

`execFallback` is a special lifecycle method on the `Node` class. It is only called if all `exec` attempts (initial + retries) have failed. It receives the same `args` as `exec`, with the final `error` object included.

The return value of `execFallback` will be passed to the `post` phase, just as a successful `exec` result would be. This allows your workflow to gracefully recover and continue, perhaps with default or cached data.

### Example: Using a Fallback

Let's modify the previous example to handle a permanent failure.

```typescript
import { Node, Flow, TypedContext, contextKey, ConsoleLogger } from 'cascade'

class ResilientApiNode extends Node<void, { data: string }> {
  constructor() {
    super({ maxRetries: 2 }) // Try twice
  }

  async exec() {
    console.log('Attempting to call the API...')
    throw new Error('API is down!')
  }

  // This method runs after all exec retries fail.
  async execFallback({ error }) {
    console.error(`All API attempts failed. Reason: ${error.message}`)
    console.log('Returning cached/default data as a fallback.')
    return { data: 'default fallback data' }
  }

  async post({ ctx, execRes }) {
    // The post phase doesn't care if exec or execFallback ran.
    // It just receives the result.
    ctx.set(DATA_KEY, execRes.data)
  }
}

const DATA_KEY = contextKey<string>('data')
const context = new TypedContext()
const flow = new Flow(new ResilientApiNode())

await flow.run(context, { logger: new ConsoleLogger() })

console.log(`Final data in context: ${context.get(DATA_KEY)}`)
```

The output will be:

```
[INFO] Running node: ResilientApiNode
Attempting to call the API...
[WARN] Attempt 1/2 failed for ResilientApiNode. Retrying...
Attempting to call the API...
[ERROR] All retries failed for ResilientApiNode. Executing fallback.
All API attempts failed. Reason: API is down!
Returning cached/default data as a fallback.
Final data in context: default fallback data
```

The workflow completed successfully because the fallback provided a valid result, allowing the `post` phase and the rest of the flow to proceed.
