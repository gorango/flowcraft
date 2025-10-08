# The Basics of Declarative Workflows

While programmatic workflows are excellent for tasks defined in code, Flowcraft's true power for building large-scale, dynamic, or distributed systems comes from its **declarative workflow engine**.

This approach allows you to define the structure and logic of a workflow as a plain data object (like JSON), which can be stored, versioned, and executed by a generic runtime engine. This is the key to building systems where workflows are configuration, not code.

The declarative engine has three main components:
1.  **`WorkflowGraph`**: The declarative data format for your workflow.
2.  **`GraphBuilder`**: A "compiler" that transforms the `WorkflowGraph` into an executable plan.
3.  **`BlueprintExecutor`**: A runtime engine that hydrates and executes the plan.

This guide will walk you through each step.

## 1. Define a Graph

A `WorkflowGraph` is a simple object with two properties: `nodes` and `edges`.

-   `nodes`: An array of objects, each defining a step in the workflow with a unique `id`, a `type`, and a `data` payload.
-   `edges`: An array of objects that connect the nodes, defining the `source` and `target` for each connection.

Let's define a simple graph that sets an initial value and then adds to it.

```json
// my-workflow.json
{
	"nodes": [
		{ "id": "start", "type": "set", "data": { "value": 10 } },
		{ "id": "add-5", "type": "add", "data": { "value": 5 } }
	],
	"edges": [
		{ "source": "start", "target": "add-5" }
	]
}
```

## 2. Create a Node Registry

The `type` string in your graph definition needs to be mapped to an actual `Node` class. This is done via a **Node Registry**. The registry is a simple object where keys are the `type` strings from your graph, and values are the corresponding `Node` classes.

Let's create the `SetValueNode` and `AddValueNode` classes needed for our graph.

```typescript
import { contextKey, Node, NodeConstructorOptions } from 'flowcraft'

const VALUE = contextKey<number>('value')

// The `data` payload from the graph is passed to the constructor.
interface SetData { value: number }
class SetValueNode extends Node {
	private value: number
	constructor(options: NodeConstructorOptions<SetData>) {
		super()
		this.value = options.data.value
	}

	async exec({ ctx }) {
		await ctx.set(VALUE, this.value)
	}
}

interface AddData { value: number }
class AddValueNode extends Node {
	private valueToAdd: number
	constructor(options: NodeConstructorOptions<AddData>) {
		super()
		this.valueToAdd = options.data.value
	}

	async exec({ ctx }) {
		const current = (await ctx.get(VALUE)) ?? 0
		await ctx.set(VALUE, current + this.valueToAdd)
	}
}
```

Now, we create the registry to map our `type` strings to these classes. It's a best practice to use the `createNodeRegistry` helper to get compile-time type safety.

```typescript
import { createNodeRegistry } from 'flowcraft'

// Define a "map" of your node types to their data shapes.
interface MyNodeTypeMap {
	set: SetData
	add: AddData
}

const myRegistry = createNodeRegistry<MyNodeTypeMap>({
	set: SetValueNode,
	add: AddValueNode,
})
```

## 3. Build the Flow with `GraphBuilder`

The `GraphBuilder` is the central component that brings everything together. It takes your `WorkflowGraph` and your `NodeRegistry` and "compiles" them into a runnable `Flow` and a serializable `WorkflowBlueprint`.

```typescript
import { GraphBuilder, TypedContext } from 'flowcraft'
import myGraph from './my-workflow.json'

// Instantiate the builder with your registry.
const builder = new GraphBuilder(myRegistry)

// The `buildBlueprint` method creates a serializable plan.
const { blueprint } = builder.buildBlueprint(myGraph)

// The blueprint is a plain JavaScript object, safe to be stored or sent over a network.
console.log(blueprint)
```

The `blueprint` is a static, detailed execution plan. It contains the final list of nodes and edges (including any internally generated ones for handling patterns like parallelism) and metadata maps crucial for distributed execution.

## 4. Run the Blueprint

The `BlueprintExecutor` is a specialized engine designed to take a `WorkflowBlueprint`, "hydrate" it by instantiating the necessary nodes from the registry, and run the resulting flow.

```typescript
import { BlueprintExecutor } from 'flowcraft'

const context = new TypedContext()

// The executor can run the blueprint many times with different contexts.
const executor = new BlueprintExecutor(blueprint, myRegistry)
await executor.run(executor.flow, context)

console.log(`Final value: ${await context.get(VALUE)}`) // Final value: 15
```

This separation between the declarative definition (`WorkflowGraph`), the build step (`GraphBuilder`), and the execution step (`BlueprintExecutor`) is what makes the declarative approach so powerful and scalable.

### Next Steps

-   **[Composition & Data Flow](./composition-data-flow.md)**: Learn how to build complex workflows by composing smaller ones.
-   **[Dependency Injection](./dependency-injection.md)**: See how to provide shared services like database clients to all your nodes.
-   **[Tooling & Validation](./tooling-validation.md)**: Discover how to validate and visualize your declarative graphs.
