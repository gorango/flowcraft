# The Basics of Programmatic Workflows

This guide covers the fundamentals of building workflows directly in your code. You'll learn how to create custom `Node` classes, connect them into a graph, manage state with the `Context`, and implement conditional branching.

This approach is ideal for integrating complex, multi-step processes directly into your application's existing codebase.

## 1. Creating Nodes

The `Node` is the fundamental unit of work. The best practice is to create a dedicated class for each distinct task in your workflow. This makes your logic reusable, testable, and easy to understand.

To create a custom node, you extend the base `Node` class and override one or more of its lifecycle methods: `prep`, `exec`, and `post`.

Let's create a simple node that adds two numbers.

```typescript
import { contextKey, Node, TypedContext } from 'flowcraft'

// Best practice: Define context keys for any data you'll need.
const VALUE = contextKey<number>('value')

// This node adds a static number (from its params) to a value in the context.
class AddNode extends Node {
	private numberToAdd: number

	constructor(numberToAdd: number) {
		super()
		this.numberToAdd = numberToAdd
	}

	// 1. `prep`: Gathers data. Here, we read the current value from the context.
	async prep({ ctx }) {
		return (await ctx.get(VALUE)) ?? 0
	}

	// 2. `exec`: Performs the core logic. It receives the result of `prep`.
	async exec({ prepRes: currentValue }) {
		return currentValue + this.numberToAdd
	}

	// 3. `post`: Updates the context with the result of `exec`.
	async post({ ctx, execRes: result }) {
		await ctx.set(VALUE, result)
	}
}
```

## 2. Chaining Nodes with `.next()`

Once you have your node classes, you can create instances and wire them together into a `Flow`. The `.next()` method is the primary way to define the sequence of execution.

```typescript
import { Flow } from 'flowcraft'

// Create instances of our node.
const add5Node = new AddNode(5)
const add10Node = new AddNode(10)

// Chain them together. `.next()` connects the default action of one
// node to the start of the next.
add5Node.next(add10Node)

// Create a flow, providing the starting node.
const mathFlow = new Flow(add5Node)

// Let's run it.
const context = new TypedContext()
await mathFlow.run(context)

console.log(`Final value: ${await context.get(VALUE)}`) // Final value: 15
```

## 3. Managing State with the Context

The `Context` is the shared memory for your workflow. As you saw above, nodes use it to pass data to each other.

-   **Reading**: You typically read from the context in the `prep` phase to gather the data your node needs.
-   **Writing**: You typically write back to the context in the `post` phase after your node's logic has successfully executed.

All context operations are **asynchronous**, so you must always use `await`.

```typescript
// Reading from the context
const someValue = await ctx.get(SOME_KEY)

// Writing to the context
await ctx.set(ANOTHER_KEY, 'new-value')
```

## 4. Branching Logic

Workflows are rarely linear. To implement conditional logic, you make your `post` method return a custom **action string**. The executor will then follow the path associated with that action.

Let's create a "decider" node that checks if a number is positive or negative.

```typescript
class CheckSignNode extends Node<void, void, 'positive' | 'negative' | 'zero'> {
	async post({ ctx }) {
		const value = (await ctx.get(VALUE)) ?? 0
		if (value > 0) {
			return 'positive'
		}
		else if (value < 0) {
			return 'negative'
		}
		else {
			return 'zero'
		}
	}
}

// Create nodes for each branch
const handlePositiveNode = new Node().exec(() => console.log('The number was positive.'))
const handleNegativeNode = new Node().exec(() => console.log('The number was negative.'))
const handleZeroNode = new Node().exec(() => console.log('The number was zero.'))

const checkNode = new CheckSignNode()

// Wire the branches using the custom action strings.
checkNode.next(handlePositiveNode, 'positive')
checkNode.next(handleNegativeNode, 'negative')
checkNode.next(handleZeroNode, 'zero')

const branchingFlow = new Flow(checkNode)

// Running with a positive number will take the 'positive' path.
const positiveContext = new TypedContext([[VALUE, 10]])
await branchingFlow.run(positiveContext) // Logs: "The number was positive."
```

By combining custom node classes, `.next()`, the `Context`, and custom actions, you can programmatically build workflows of any complexity.

### Next Steps

-   **[Functional API](./functional-api.md)**: Learn how to create simple nodes without writing a full class.
-   **[Data Processing Pipelines](./data-pipelines.md)**: Discover the powerful fluent API (`.map`, `.filter`) for data transformation.
