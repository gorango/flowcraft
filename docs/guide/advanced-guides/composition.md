# Advanced Guide: Composition

One of the most powerful features of Cascade is its composability. Because a `Flow` is itself a type of `Node`, you can treat an entire workflow as a single building block within a larger, more complex workflow. This allows you to create highly modular, reusable, and maintainable systems.

## Why Use Composition?

- **Modularity**: Break down a large, monolithic workflow into smaller, self-contained sub-flows. Each sub-flow can manage its own internal logic and middleware.
- **Reusability**: Define a common workflow (e.g., "send a formatted email") once and reuse it in multiple different parent flows (e.g., "user registration flow", "password reset flow").
- **Clarity**: The parent flow becomes simpler and easier to read. Instead of a dozen small nodes, you might have three high-level sub-flows, making the overall business logic clearer.
- **Independent Testing**: Each sub-flow can be tested in isolation before being integrated into a larger system.

## How It Works

Composing flows is as simple as treating a `Flow` instance as if it were a `Node` instance and using it with methods like `.next()` or in builders like `SequenceFlow`.

When an executor's main orchestration loop is running a parent flow and encounters a `Flow` node (a sub-flow), it calls that node's `exec` method. The `Flow.exec` method then takes over and runs its *own* internal orchestration loop, executing its entire graph from start to finish.

The **final action** returned by the sub-flow's last node is then returned as the result of the `exec` method. The parent flow's executor uses this action to decide which of the sub-flow's successors to execute next, enabling conditional branching based on the outcome of an entire encapsulated workflow.

### Example: A Reusable "Math" Sub-Flow

Let's create a simple sub-flow that performs a calculation and a parent flow that uses it.

#### 1. Define the Sub-Flow

This sub-flow will take a number, add 10, multiply by 2, and then return a specific action based on the result.

```typescript
// sub-flow.ts
import { Flow, Node, contextKey, TypedContext } from 'cascade'

export const MATH_VALUE = contextKey<number>('math_value')

// A node that returns a different action based on the result
class CheckResultNode extends Node<void, void, 'over_50' | 'under_50'> {
  async post({ ctx }) {
    const value = ctx.get(MATH_VALUE)!
    return value > 50 ? 'over_50' : 'under_50'
  }
}

export function createMathFlow(): Flow {
  const addNode = new Node()
    .exec(async ({ params }) => params.input + 10)
    .toContext(MATH_VALUE)

  const multiplyNode = new Node()
    .exec(async ({ ctx }) => ctx.get(MATH_VALUE)! * 2)
    .toContext(MATH_VALUE)

  const checkNode = new CheckResultNode()

  addNode.next(multiplyNode).next(checkNode)

  const mathFlow = new Flow(addNode)
  return mathFlow
}
```

#### 2. Compose it in a Parent Flow

Now, the main workflow can use `createMathFlow()` as a single step.

```typescript
// main.ts
import { Flow, Node, TypedContext } from 'cascade'
import { createMathFlow } from './sub-flow'

// Create an instance of our reusable sub-flow
const mathSubFlow = createMathFlow()

// Create nodes for the parent flow's branching logic
const handleOver50Node = new Node().exec(() => console.log('Result was over 50.'))
const handleUnder50Node = new Node().exec(() => console.log('Result was 50 or under.'))

// The parent flow starts with the sub-flow.
const parentFlow = new Flow(mathSubFlow)

// Use the actions returned by the sub-flow to branch.
mathSubFlow.next(handleOver50Node, 'over_50')
mathSubFlow.next(handleUnder50Node, 'under_50')

// Run the parent flow with an input that will result in a value over 50.
// (20 + 10) * 2 = 60
console.log('--- Running with input 20 ---')
await parentFlow.withParams({ input: 20 }).run(new TypedContext())

// Run it again with an input that results in a value under 50.
// (5 + 10) * 2 = 30
console.log('--- Running with input 5 ---')
await parentFlow.withParams({ input: 5 }).run(new TypedContext())
```

The output will be:

```
--- Running with input 20 ---
Result was over 50.
--- Running with input 5 ---
Result was 50 or under.
```

As you can see, the parent flow's executor correctly branched based on the final action returned by the `mathSubFlow`, demonstrating seamless composition.

## Data Flow and Context

The `Context` is shared between the parent and the sub-flow.

- The sub-flow can read data that was set in the `Context` by previous nodes in the parent flow.
- The sub-flow can write data to the `Context`, and that data will be available to subsequent nodes in the parent flow.

This shared-memory model makes passing data between composed flows trivial. However, be mindful of potential key collisions if sub-flows are developed independently. Using descriptive and unique `ContextKey`s is a good practice to avoid conflicts.

For a more advanced and robust pattern for managing data flow, especially when using the declarative `GraphBuilder`, see the guide on **[Best Practices: Data Flow in Sub-Workflows](../best-practices/sub-workflow-data.md)**.
