# Cancellation Support

In many applications, especially those involving long-running asynchronous operations, you need a way to gracefully abort a process that is already in flight. Cascade provides robust cancellation support out of the box by integrating with the standard web `AbortController` and `AbortSignal` APIs.

## How It Works

When you run a `Flow`, you can pass an `AbortController` instance in the `RunOptions`.

```typescript
const controller = new AbortController()
flow.run(context, { controller })
```

> [!IMPORTANT]
> Cascade passes the `AbortSignal` to every node, but it's your responsibility to use it. The framework cannot magically interrupt your asynchronous code. You must design your `exec` logic to listen for the abort event and stop its work, as shown in the examples below.

Calling `controller.abort()` will cause the currently running asynchronous operation to throw an `AbortError`, which immediately and cleanly halts the entire workflow.

## When to Use Cancellation

- **User-Initiated Actions**: In a web server, a user might navigate away from a page or click a "Cancel" button while a complex background job is running. You can use the `AbortSignal` from the HTTP request to abort the workflow.
- **Timeouts**: You can implement a timeout by calling `controller.abort()` after a certain duration.
- **Resource Management**: If a parent process is shutting down, it can signal its child workflows to abort their tasks cleanly.

## Implementing a Cancellable Node

To make a `Node` cancellable, you need to use the `signal` object provided in the `NodeArgs` within your asynchronous logic.

### Example: A Cancellable `sleep`

The most common use case is passing the `signal` to I/O-bound operations like `fetch` or custom-built helpers. Let's create a `sleep` function that respects the `AbortSignal`.

```typescript
import { AbortError } from 'cascade'

// A helper that rejects if the signal is aborted
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if the operation was already aborted
    if (signal?.aborted) {
      return reject(new AbortError())
    }

    const timeoutId = setTimeout(resolve, ms)

    // Add an event listener to clean up when aborted
    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      reject(new AbortError())
    })
  })
}
```

(Note: A `sleep` utility like this is included in Cascade).

### Example: A Long-Running Node

Now, let's use this `sleep` function inside a `Node`.

```typescript
import { Node, Flow, TypedContext, AbortError, ConsoleLogger, sleep } from 'cascade'

class LongRunningNode extends Node {
  async exec({ signal, logger }) {
    logger.info('Starting a very long task...')
    try {
      // Pass the signal to our async operation
      await sleep(5000, signal)
      logger.info('Task finished successfully.')
    } catch (e) {
      if (e instanceof AbortError) {
        logger.warn('The long task was aborted!')
      }
      // Re-throw the error to ensure the flow stops
      throw e
    }
  }
}

const flow = new Flow(new LongRunningNode())
const context = new TypedContext()
const controller = new AbortController()

// Set a timeout to abort the flow after 1 second
setTimeout(() => {
  console.log('>>> Aborting workflow from the outside!')
  controller.abort()
}, 1000)

try {
  await flow.run(context, { controller, logger: new ConsoleLogger() })
} catch (e) {
  if (e instanceof AbortError) {
    console.error('Workflow execution was successfully aborted.')
  } else {
    console.error('An unexpected error occurred:', e)
  }
}
```

When you run this code, the output will be:

```
[INFO] Running node: LongRunningNode
[INFO] Starting a very long task...
>>> Aborting workflow from the outside!
[WARN] The long task was aborted!
Workflow execution was successfully aborted.
```

The `sleep` function was interrupted, the `catch` block inside the node logged a warning, and the re-thrown `AbortError` was caught at the top level, confirming that the workflow was gracefully terminated.

This cancellation pattern is robust and extends to custom execution environments. For instance, the distributed worker example demonstrates how to bridge an external cancellation signal (from Redis) to the standard `AbortSignal`, ensuring that even long-running, distributed jobs can be gracefully terminated mid-flight.
