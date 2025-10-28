# Loops

For workflows that require iteration, you can use either the Fluent API's [`.loop()`](/api/flow#loop-id-options) method or write imperative loops with the compiler.

## Fluent API

For workflows that require iteration, the [`Flow`](/api/flow#flow-class) builder provides a [`.loop()`](/api/flow#loop-id-options) method. This allows you to execute a portion of your graph repeatedly until a condition is met.

## With the Compiler

When you write imperative loops in your `/** @flow */` functions, the compiler automatically generates the underlying declarative pattern for you:

```typescript
/** @flow */
export async function counterWorkflow() {
  let count = 0

  while (count < 5) {
    count = await incrementCounter(count)
  }

  return count
}

/** @step */
async function incrementCounter(currentCount: number) {
  const newCount = currentCount + 1
  console.log(`Count is now: ${newCount}`)
  return newCount
}
```

This imperative code compiles to the same loop structure as the Fluent API example below.

## The `.loop()` Method

The [`.loop()`](/api/flow#loop-id-options) method creates a special `loop-controller` node that manages the iteration. After the last node in the loop body executes, the controller evaluates a condition to decide whether to run the loop again or exit.

Here's the method signature:
```typescript
flow.loop(
	id: string, // A unique ID for the loop construct
	options: {
		startNodeId: string, // The ID of the first node in the loop body
		endNodeId: string, // The ID of the last node in the loop body
		condition: string, // An expression to evaluate. If true, the loop continues.
	}
)
```

## Example: Simple Counter

Let's build a workflow that increments a counter from 0 to 5.

```typescript
import { createFlow } from 'flowcraft'

const flow = createFlow('loop-workflow')
	// 1. Initialize the counter in the context before the loop starts.
	.node('initialize', async ({ context }) => {
		await context.set('count', 0)
		return { output: 'Initialized' }
	})

	// 2. This is the body of our loop. It reads, increments, and saves the counter.
	.node('increment', async ({ context }) => {
		const currentCount = await context.get('count') || 0
		const newCount = currentCount + 1
		await context.set('count', newCount)
		console.log(`Count is now: ${newCount}`)
		return { output: newCount }
	})

	// 3. Define the loop.
	.loop('counter', {
		startNodeId: 'increment',
		endNodeId: 'increment', // The loop body is just one node.
		condition: 'count < 5' // Continue as long as this is true.
	})

	// 4. Define the edges.
	.edge('initialize', 'increment')
	.toBlueprint()
```

### How It Works

The [`.loop()`](/api/flow#loop-id-options) method adds a `loop-controller` node.

<DemoLoop />

1.  `initialize` runs once, setting `count` to 0.
2.  It triggers `increment`, which sets `count` to 1.
3.  `increment` completes and triggers `counter-loop`.
4.  The controller evaluates the condition. If true, it triggers `increment` again.
5.  This repeats until the condition is false.

> [!NOTE]
> The [`.loop()`](/api/flow#loop-id-options) method automatically configures the `joinStrategy` of the loop's start and end nodes to `'any'` so they can be re-executed on each iteration.

## Security Considerations

By default, Flowcraft uses [`PropertyEvaluator`](/api/evaluator#propertyevaluator-class) for expression evaluation, which only allows simple property access (e.g., `result.output.status`). Complex expressions with operators like `<`, `>`, `===`, or `!==` (as shown in the example above) require the [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class).

If your loop condition uses comparison or logical operators, you must explicitly configure your runtime to use [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class):

```typescript
import { FlowRuntime, UnsafeEvaluator } from 'flowcraft'

const runtime = new FlowRuntime({
	evaluator: new UnsafeEvaluator(),
})
```

> [!WARNING]
> [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class) uses `new Function()` and can execute arbitrary JavaScript code. Only use it in trusted environments where all workflow definitions are authored by trusted developers. For production systems, consider implementing a custom evaluator using a sandboxed library like [`jsep`](https://npmjs.com/package/jsep).

## Cycles and Non-DAG Flows

While loops provide a structured way to handle iteration, it's also possible to create workflows with cycles (non-DAG graphs) using manual edges. However, this comes with significant risks and unpredictable behavior.

### Risks of Non-DAG Workflows

When a workflow contains cycles and is run in non-strict mode, the runtime arbitrarily selects the first node of a detected cycle as the starting point. This can lead to:

- **Unpredictable execution flow**: The order of execution may vary between runs, making the workflow behavior inconsistent.
- **Infinite loops**: If not carefully designed, cycles can cause the workflow to run indefinitely.
- **Resource exhaustion**: Uncontrolled cycles can consume excessive CPU and memory.
- **Debugging difficulties**: Tracing the execution path becomes challenging due to the non-deterministic nature.

### Recommendations

1. **Use structured loops**: Prefer the `.loop()` method for iteration instead of manual cycles, as it provides predictable behavior and built-in safeguards.

2. **Enable strict mode**: Run workflows in strict mode (`strict: true`) to prevent execution of non-DAG graphs entirely:

   ```typescript
   const result = await runtime.run(blueprint, initialContext, { strict: true })
   ```

3. **Design for predictability**: If you must use cycles, ensure they have clear entry and exit points, and test thoroughly in various scenarios.

4. **Monitor execution**: In production, implement monitoring to detect and handle potential infinite loops or excessive resource usage.

> [!CAUTION]
> Non-DAG workflows in non-strict mode are inherently unpredictable and should be avoided in production environments unless absolutely necessary and thoroughly tested.
