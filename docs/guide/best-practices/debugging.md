# Best Practices: Debugging Workflows

Debugging multi-step, asynchronous workflows can be challenging. State can change in unexpected ways, and control flow can be complex. Flowcraft is designed with debuggability in mind and provides several tools and patterns to help you pinpoint issues quickly.

This guide covers the most effective techniques for debugging your workflows.

## 1. Inspect Data Flow with `.tap()`

> [!TIP]
> The `.tap()` method is your best friend for non-disruptive debugging. It's the cleanest way to inspect data mid-pipeline without breaking a fluent chain.

Instead of breaking your chain to insert a `console.log`, use the `.tap()` method. It receives the result of the previous step, allows you to perform a side-effect (like logging), and then passes the original result through to the next step, completely unmodified.

**Scenario**: You have a chain of `.map()` calls and want to see the intermediate result.

```typescript
import { contextKey, Node } from 'flowcraft'

const FINAL_RESULT = contextKey<string>('final_result')

// A node that fetches a user object
const fetchUserNode = new Node().exec(() => ({ id: 123, name: 'Alice', email: 'alice@test.com' }))

const processUser = fetchUserNode
	.map(user => ({ ...user, name: user.name.toUpperCase() }))
// Let's inspect the data right here!
	.tap((intermediateResult) => {
		console.log('[DEBUG] After capitalization:', intermediateResult)
	})
	.map(user => `User ID: ${user.id}, Name: ${user.name}`)
	.toContext(FINAL_RESULT)

// When this runs, the debug log will print the intermediate object.
```

## 2. Trace Execution with the Logger

When your problem is about *control flow* ("Why did my workflow take the wrong branch?") or *data flow* ("What was the exact data passed to this node?"), the logger is your best friend.

By passing a `ConsoleLogger` to your `flow.run()` call, you get a detailed, step-by-step trace of the entire execution. For maximum visibility, **set the log level to `'debug'`**.

```typescript
import { ConsoleLogger, Flow, TypedContext } from 'flowcraft'

const myFlow = createMyConditionalFlow()
const context = new TypedContext()

// Run the flow with verbose debug logging enabled
const logger = new ConsoleLogger({ level: 'debug' })
await myFlow.run(context, { logger })
```

The `debug` logger will show you:

-   Which node is currently running.
-   The exact `params` passed to the node.
-   The result of the `prep()` and `exec()` phases.
-   The **action** string returned by each node.
-   The successor node chosen for that action.
-   Warnings for retry attempts and errors for fallback execution.

**Example Debug Log Output**:

```
[INFO] Running node: CheckConditionNode
[DEBUG] [CheckConditionNode] Received params { userId: 123 }
[DEBUG] [CheckConditionNode] prep() result { user: { name: 'Alice', role: 'admin' } }
[DEBUG] [CheckConditionNode] exec() result true
[DEBUG] [CheckConditionNode] post() returned action: 'action_approve'
[DEBUG] Action 'action_approve' from CheckConditionNode leads to ApproveNode
[INFO] Running node: ApproveNode
...
```

This output makes it immediately clear what data the node received, what it produced, and why it took a specific branch. See the **[Logging Guide](../advanced-guides/logging.md)** for more details.

## 3. Visualize Your Graph

### Programmatic Flows with `generateMermaidGraph`

If you've wired your nodes together programmatically with `.next()`, it's easy to make a mistake. The `generateMermaidGraph` utility creates a visual representation of your `Flow`'s structure. You can paste the output into any Mermaid.js renderer (like the one in the GitHub or VS Code markdown preview) to see your workflow.

```typescript
import { generateMermaidGraph } from 'flowcraft'
import { createMyComplexFlow } from './my-flows'

const complexFlow = createMyComplexFlow()

// Generate the Mermaid syntax
const mermaidSyntax = generateMermaidGraph(complexFlow)
console.log(mermaidSyntax)
```

### Declarative Flows with `GraphBuilder`

The `GraphBuilder` can automatically generate and log a detailed Mermaid.js diagram of the final, **flattened graph**. This is an invaluable tool for debugging, as it shows you the exact structure the `Executor` will run, including inlined sub-workflows, injected mapping nodes, and generated parallel blocks.

To see the graph, simply pass `true` as the second argument to the `.build()` method. The diagram will be logged at the `info` level, so ensure your logger is configured to show it.

**Scenario**: You are building a complex workflow and want to see the final executable graph.

```typescript
import { ConsoleLogger, GraphBuilder } from 'flowcraft'

// Assume `nodeRegistry` and `myComplexGraph` are defined

// Instantiate the builder WITH a logger to see the output
const builder = new GraphBuilder(
	nodeRegistry,
	{ /* dependencies */ },
	{ /* options */ },
	new ConsoleLogger({ level: 'info' }) // <-- Ensure 'info' level is visible
)

// Pass `true` to log the final graph.
const { flow } = builder.build(myComplexGraph, true)
```

**Example Log Output**:

The builder will log a complete Mermaid diagram. You can paste this into any compatible renderer to see the visual graph.

```
[INFO] [GraphBuilder] Flattened Graph
[INFO] graph TD
[INFO]   ParallelBlock_0{Parallel Block}
[INFO]   check_sentiment_0["check_sentiment (llm-condition)"]
[INFO]   ... and so on ...
```

## 4. Isolate and Inspect Nodes

If a single node is behaving incorrectly, you can debug it in isolation.

### Isolate with `.run()`

You can test a node's full lifecycle (`prep`, `exec`, `post`) by calling its own `.run()` method without the complexity of the entire workflow.

1. Create a `TypedContext` and manually set any values the node needs.
2. Call `node.run(context)`.
3. Assert that the `Context` contains the expected values after the run.

### Inspect with `getNodeById()` or `nodeMap`

- **Programmatic Flows**: Use `flow.getNodeById()` to get a direct reference to any node instance to inspect its configuration before the flow runs.
- **`GraphBuilder` Flows**: Always use the `nodeMap` returned by the `.build()` method for the most efficient lookup.

```typescript
const { flow, nodeMap } = builder.build(myGraph)
const specificNode = nodeMap.get('my-node-id') // O(1) lookup
```

## Common Pitfalls

If your workflow isn't behaving as expected, check for these common issues:

- **Forgetting `await flow.run()`**: Since workflows are asynchronous, forgetting to `await` the top-level `run()` call will cause your script to exit before the workflow can complete.
- **Context Key Collisions**: In large, composed flows, different sub-flows might accidentally write to the same context key, overwriting each other's data. Using descriptive, unique `ContextKey`s helps prevent this.
- **Infinite Loops**: If you create a cycle in your graph, make sure your "decider" node has a reliable exit condition. Use the logger to trace the loop and see if the context state is changing as expected on each iteration.
- **Mutating Objects in Context**: If you place a mutable object (like `{}`, `[]`) in the context, any node can modify it. This can lead to unexpected behavior if one node changes an object that a later node relies on. It's often safer for nodes to create new objects/arrays rather than modifying existing ones in place.
