# Composition

One of the most powerful features of Flowcraft is its composability. Because a `Flow` is itself a type of `Node`, you can treat an entire workflow as a single building block within a larger, more complex workflow.

Flowcraft supports two primary models for composition, each suited to different use cases.

## 1. Programmatic Composition (In-Memory)

When you build workflows programmatically (by instantiating `Node` and `Flow` classes and wiring them with `.next()`), you can place one `Flow` instance inside another.

**How It Works:** The `InMemoryExecutor` understands this pattern. When its orchestration loop encounters a `Flow` node, it calls that node's `exec` method. The `Flow.exec` method then takes over and runs its *own* internal orchestration loop, executing its entire graph from start to finish. The final action from the sub-flow is returned to the parent, allowing for branching.

**When to Use:** This model is excellent for simple, in-memory workflows where you want to organize logic into reusable, testable sub-units.

### Example: A Reusable "Math" Sub-Flow

```typescript
// --- sub-flow.ts ---
// A sub-flow that adds 10, multiplies by 2, and returns an action.
export function createMathFlow(): Flow {
	const addNode = new Node().exec(async ({ params }) => params.input + 10).toContext(MATH_VALUE)
	const multiplyNode = new Node().exec(async ({ ctx }) => ctx.get(MATH_VALUE)! * 2).toContext(MATH_VALUE)
	const checkNode = new CheckResultNode() // Returns 'over_50' or 'under_50'

	addNode.next(multiplyNode).next(checkNode)
	return new Flow(addNode)
}

// --- main.ts ---
const mathSubFlow = createMathFlow()
const handleOver50Node = new Node().exec(() => console.log('Result was over 50.'))
const handleUnder50Node = new Node().exec(() => console.log('Result was 50 or under.'))

// The parent flow starts with the sub-flow instance.
const parentFlow = new Flow(mathSubFlow)
mathSubFlow.next(handleOver50Node, 'over_50')
mathSubFlow.next(handleUnder50Node, 'under_50')

await parentFlow.withParams({ input: 20 }).run(new TypedContext()) // "Result was over 50."
```

## 2. Declarative Composition with `GraphBuilder`

For complex, declarative, and distributed workflows, Flowcraft uses a more powerful **"Graph Inlining"** pattern. This is the recommended approach for building scalable systems.

> [!IMPORTANT]
> **You must explicitly tell the builder which node types represent sub-workflows** and provide a `subWorkflowResolver` in its constructor options. This gives you the flexibility to use semantically rich names like `"search-workflow"` or `"process-document-pipeline"`.
>
> If the builder encounters a node with a `workflowId` property in its `data` payload whose `type` has not been registered as a sub-workflow, it will throw a configuration error.

**How It Works:** This is a **build-time** process, not a runtime one. When the `GraphBuilder` encounters a node whose type is registered as a sub-workflow, it performs "graph surgery":

1.  **Replaces the Node**: It removes the composite node from the graph.
2.  **Inlines the Graph**: It fetches the sub-workflow's graph definition (using the provided `subWorkflowResolver`) and injects all of its nodes and edges into the parent graph, prefixing their IDs to prevent collisions.
3.  **Inserts Mapping Nodes**: It automatically creates two lightweight "gatekeeper" nodes:
    *   An **`InputMappingNode`** at the entry point, which copies data from the parent context to the keys expected by the sub-workflow (based on your `inputs` map).
    *   An **`OutputMappingNode`** at the exit point, which copies data from the sub-workflow's context back to the parent (based on your `outputs` map).
4.  **Re-wires Edges**: All original edges are seamlessly re-wired to these new mapping nodes.

The result is a single, unified, "flat" graph that is handed to the executor.

### Benefits of Graph Inlining

-   **Simplified Runtimes**: The executor (e.g., `BullMQExecutor`) is completely unaware of composition. It just runs a larger, pre-compiled graph, making the runtime logic much simpler and faster.
-   **Non-Blocking Workers**: This is critical for distributed systems. A worker never has to block and wait for a sub-workflow to finish. It executes its single node and moves on.
-   **Clear Data Contracts**: The `inputs` and `outputs` maps in your JSON definition become an explicit, declarative data contract, preventing state leakage and making data flow easy to trace. See the guide on **[Best Practices: Data Flow in Sub-Workflows](../best-practices/sub-workflow-data.md)** for more details.

This powerful pattern moves complexity from the runtime to the build step, which is a best practice for building robust, high-performance systems.
