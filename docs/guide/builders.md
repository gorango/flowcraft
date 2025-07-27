# Builders

Builders are helper classes provided by Flowcraft to abstract away the manual construction of common and complex workflow patterns. They handle the underlying `Node` and `Flow` wiring for you, so you can focus on your application's logic.

This guide provides an overview of the available builders and helps you choose the right one for your use case.

## Choosing the Right Builder

- **For simple, linear sequences...**
    ...where one step follows the next without branching, use **[`SequenceFlow`](#sequenceflow)**. It's the simplest way to create a basic pipeline. The functional `pipeline` helper offers an even more concise syntax for the same pattern.

- **For parallel execution of different tasks...**
    ...where your workflow has distinct branches that can run concurrently (a "fan-out, fan-in" pattern), use **[`ParallelFlow`](#parallelflow)**. This is ideal for structural parallelism, like fetching data from two different APIs at the same time.

- **For processing a collection of data items...**
    ...where you need to run the *same* operation on many different pieces of data, use a batch processor. Choose **[`ParallelBatchFlow`](#batch-processing-batchflow-and-parallelbatchflow)** for I/O-bound tasks (like making many API calls) or **[`BatchFlow`](#batch-processing-batchflow-and-parallelbatchflow)** for tasks that must run sequentially.

- **For dynamic, data-driven graphs...**
    ...where your workflow logic is defined in a declarative format like JSON, use the **[`GraphBuilder`](#graphbuilder)**. This is the most powerful and flexible option, perfect for building dynamic AI agent runtimes or systems where workflows are configuration, not code.

---

## `SequenceFlow`

`SequenceFlow` creates a linear `Flow` from a list of nodes, automatically chaining them together in the order they are provided.

### Example: Class-based Builder

Instead of wiring nodes manually with `.next()`:

```typescript
const nodeA = new NodeA()
const nodeB = new NodeB()
const nodeC = new NodeC()

nodeA.next(nodeB)
nodeB.next(nodeC)

const manualFlow = new Flow(nodeA)
```

You can use `SequenceFlow` for a more concise definition:

```typescript
import { SequenceFlow } from 'flowcraft'

const sequence = new SequenceFlow(
	new NodeA(),
	new NodeB(),
	new NodeC()
)

await sequence.run(context)
```

For an even more functional style, the `pipeline` helper provides the same functionality with a more direct syntax. See the [Functional API Reference](./functional-api.md#pipeline) for more details.

```typescript
import { pipeline } from 'flowcraft'

const dataPipeline = pipeline(
	new NodeA(),
	new NodeB(),
	new NodeC()
)
```

---

## `ParallelFlow`

`ParallelFlow` executes a fixed set of different nodes concurrently. This is the "fan-out, fan-in" pattern, used for **structural parallelism**. After all parallel branches complete, the flow can proceed to a single, subsequent node.

### When to Use

Use `ParallelFlow` when your workflow logic itself has distinct branches that can run simultaneously. For example, building a user dashboard by fetching profile data and activity data from two different services at the same time.

### Example

```typescript
import { ParallelFlow } from 'flowcraft'

// Fetch data from two different sources in parallel.
const parallelStep = new ParallelFlow([
	new FetchUserProfileNode(), // Task A
	new FetchUserActivityNode(), // Task B
])

// This node will only run after both fetch nodes have completed.
const aggregateNode = new AggregateDashboardDataNode()
parallelStep.next(aggregateNode)

const dashboardFlow = new Flow(parallelStep)
```

---

## `BatchFlow` (Sequential)

`BatchFlow` processes items one by one, in order - executing the **same node** many times over a dynamic collection of data items. The next item is not processed until the previous one is completely finished.

**Use Cases**: Processing items in a strict order, or interacting with a rate-limited API where you must avoid sending multiple requests at once.

## `ParallelBatchFlow` (Concurrent)

`ParallelBatchFlow` processes all items concurrently - executing the **same node** many times over a dynamic collection of data items. This provides a massive performance boost for I/O-bound tasks.

**Use Cases**: Translating a document into 10 languages, fetching thumbnails for a list of 100 video URLs, or processing multiple user-uploaded files.

### Example: The Document Translator

This example uses `ParallelBatchFlow` to translate a document into several languages at once.

```typescript
import { AbstractNode, Node, ParallelBatchFlow, TypedContext } from 'flowcraft'

// The single unit of work: translates text to one language.
class TranslateNode extends Node {
	async exec({ params }) { /* ... API call to translate params.text to params.language ... */ }
}

// The builder orchestrates the batch process.
class TranslateFlow extends ParallelBatchFlow {
	// 1. Implement the abstract property to define which node to run for each item.
	protected nodeToRun: AbstractNode = new TranslateNode()

	// 2. The `prep` method provides the list of items to process.
	async prep({ ctx }) {
		const languages = ctx.get(LANGUAGES) || []
		const text = ctx.get(DOCUMENT_TEXT)

		// Return an array of parameter objects.
		// Each object will be merged into the TranslateNode's params for one parallel run.
		return languages.map(language => ({ language, text }))
	}
}
```

---

## GraphBuilder

`GraphBuilder` is the most powerful and advanced builder. It allows you to construct a fully executable `Flow` from a declarative data structure (like a JSON object). This is the key to building dynamic, data-driven systems where the workflow logic is defined as configuration, not hard-coded.

### When to Use

- When you want to define workflow logic in a database or a set of JSON/YAML files.
- When you need to support complex, non-linear workflows with multiple start points, fan-outs, and fan-ins.
- For building modular AI Agent runtimes where different "tools" or "skills" are defined as graphs.

### How It Works

1. **Define a Graph**: You create a `WorkflowGraph` object containing a list of `nodes` and `edges`.
2. **Create a Node Registry**: You map the string `type` from your graph nodes to the actual `Node` classes in your code.
3. **Build the Flow**: You instantiate `GraphBuilder` with the registry and call `.build(graph)`.

The `GraphBuilder` intelligently analyzes the graph's structure, automatically handling parallel start nodes, mid-flow fan-outs, and fan-ins. For a complete, in-depth example, see the **[Dynamic AI Agent example (`sandbox/4.dag/`)](https://github.com/gorango/flowcraft/tree/master/sandbox/4.dag/)**.
