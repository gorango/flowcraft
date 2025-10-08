# Composition & Data Flow

As your workflows grow, you'll want to break them down into smaller, reusable components. Flowcraft's `GraphBuilder` has a powerful composition model that allows you to treat entire `WorkflowGraph`s as single nodes within a parent graph.

This is achieved through a **build-time** process called **Graph Inlining**.

## The Graph Inlining Pattern

This is not a runtime concept. When the `GraphBuilder` builds your main workflow, it scans for any nodes you've designated as "sub-workflows." For each one it finds, it performs a kind of "graph surgery":

1.  **Fetches the Sub-Graph**: It uses a `subWorkflowResolver` you provide to get the graph definition for the sub-workflow.
2.  **Injects Nodes & Edges**: It injects all of the sub-graph's nodes and edges into the parent graph, prefixing their IDs to prevent collisions (e.g., `parent-node-id:child-node-id`).
3.  **Inserts Mapping Nodes**: It automatically creates two lightweight "gatekeeper" nodes to manage the flow of data: an `InputMappingNode` at the entry point and an `OutputMappingNode` at the exit.
4.  **Re-wires Connections**: It seamlessly connects the parent graph's incoming and outgoing edges to these new mapping nodes.

The result is a single, unified, "flat" graph that is handed to the executor.

### Benefits of this Approach

-   **Simplified Runtimes**: The executor is completely unaware of composition. It just runs a larger, pre-compiled graph, making the runtime logic much simpler and faster.
-   **Non-Blocking Workers (Distributed Systems)**: A worker never has to block and wait for a sub-workflow to finish. It executes its single assigned node and moves on. The orchestration of the larger flow is handled by the queue and the pre-compiled blueprint.
-   **Clear Data Contracts**: The `inputs` and `outputs` maps become an explicit, declarative data contract, preventing state leakage and making data flow easy to trace.

## How to Configure Composition

To enable graph inlining, you must provide two options to the `GraphBuilder` constructor:

1.  `subWorkflowNodeTypes: string[]`: An array of `type` strings. When the builder encounters a node whose `type` is in this list, it will treat it as a sub-workflow. This gives you the flexibility to use semantically rich names like `"search-workflow"` or `"process-document-pipeline"`.
2.  `subWorkflowResolver`: An object that knows how to fetch a graph definition by its ID. It must implement the `{ getGraph(id: string | number): WorkflowGraph | undefined }` interface.

## The Data Contract: `inputs` and `outputs`

To maintain modularity and prevent the parent and child workflows from having chaotic access to each other's state, you define an explicit data contract in the sub-workflow node's `data` payload.

### `inputs` Map

The `inputs` map defines **what data flows from the parent's context into the sub-workflow's scope**.

-   `"sub_flow_key": "parent_flow_key"`: This means "take the value from the key `parent_flow_key` in the current context and make it available under the key `sub_flow_key` for the sub-workflow."

### `outputs` Map

The `outputs` map defines **what data flows from the sub-workflow's scope back out to the parent's scope**.

-   `"parent_flow_key_for_result": "sub_flow_output_key"`: This means "after the sub-workflow is done, take the value from its `sub_flow_output_key` and save it to `parent_flow_key_for_result` in the main context."

## End-to-End Example

Let's build a workflow that uses a reusable "math" sub-workflow.

### 1. The Sub-Workflow Graph

This workflow expects a number in the context under the key `start_value`, adds 10 to it, and places the result in `math_result`.

```json
// sub-workflows/math.json
{
	"nodes": [
		{ "id": "add-10", "type": "add", "data": { "amount": 10, "inputKey": "start_value", "outputKey": "math_result" } }
	],
	"edges": []
}
```

### 2. The Parent Workflow Graph

The parent workflow will set up an initial number, call the sub-workflow, and then use its result.

```json
// main-workflow.json
{
	"nodes": [
		{ "id": "start", "type": "set", "data": { "key": "main_value", "value": 5 } },
		{
			"id": "do-math",
			"type": "math-sub-workflow",
			"data": {
				"workflowId": 101,
				"inputs": {
					"start_value": "main_value"
				},
				"outputs": {
					"final_result": "math_result"
				}
			}
		}
	],
	"edges": [
		{ "source": "start", "target": "do-math" }
	]
}
```
*   `inputs` maps the parent's `main_value` to the sub-workflow's expected `start_value`.
*   `outputs` maps the sub-workflow's `math_result` back to the parent's `final_result`.

### 3. The Code

Now we set up the `GraphBuilder` with the necessary configuration.

```typescript
import { GraphBuilder, SubWorkflowResolver, TypedContext, WorkflowGraph } from 'flowcraft'
// Assume SetValueNode and AddValueNode classes are defined

const mathSubGraph = require('./sub-workflows/math.json')

// A simple resolver that holds our sub-graphs in memory.
const resolver: SubWorkflowResolver = {
	graphs: new Map<number, WorkflowGraph>([
		[101, mathSubGraph],
	]),
	getGraph(id: number) {
		return this.graphs.get(id)
	},
}

const builder = new GraphBuilder(myRegistry, {}, {
	subWorkflowNodeTypes: ['math-sub-workflow'], // 1. Register the type
	subWorkflowResolver: resolver, // 2. Provide the resolver
})

const { blueprint } = builder.buildBlueprint(require('./main-workflow.json'))

const executor = new BlueprintExecutor(blueprint, myRegistry)
const context = new TypedContext()
await executor.run(executor.flow, context)

// The final result from the sub-workflow is now available in the parent's context.
console.log(await context.get('final_result')) // 15
```
