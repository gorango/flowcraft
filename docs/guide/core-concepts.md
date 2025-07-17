# Core Concepts

Cascade is built around a few simple, powerful concepts. Understanding them is key to using the framework effectively.

## 1. Node

The `Node` is the most fundamental building block. It represents a single, atomic unit of work in your process. Every `Node` has a well-defined, three-phase lifecycle that separates data preparation, core logic, and result processing.

### The Node Lifecycle

1. **`prep(args)`**: **Prepare Data**. This phase is for gathering all necessary data for execution. It's the ideal place to read from the `Context` or transform input `params`. The return value of `prep` is passed directly to the `exec` phase.
2. **`exec(args)`**: **Execute Core Logic**. This is where the main work happens. The `exec` phase is designed to be isolated it receives its input from `prep` and should not directly access the `Context`. This separation makes the core logic easier to test and reason about. This phase can be retried automatically on failure.
3. **`post(args)`**: **Process Results**. After `exec` completes, this phase runs. It's the ideal place to update the `Context` with the results of the execution. Its most important job is to return an **action string**, which the `Flow` uses to decide which node to run next.

### Fluent API

For many common tasks, you don't need to create a new class that extends `Node`. Instead, you can use the fluent, chainable API to define data processing pipelines. Each method returns a *new* `Node` instance.

- **`.map(fn)`**: Transforms the `exec` result of a node.
- **`.toContext(key)`**: Stores the `exec` result into the `Context`.
- **`.filter(predicate)`**: Creates a conditional gate based on the `exec` result.
- **`.tap(fn)`**: Performs a side-effect (like logging) with the `exec` result without changing it.

```typescript
import { contextKey } from 'cascade'

const USER_DATA = contextKey<{ name: string, email: string }>('user_data')

// A functional pipeline defined by chaining methods
const processUserData = new FetchUserNode(123) // Assume this node fetches a user object
  .tap(user => console.log(`Fetched user: ${user.name}`)) // Side-effect
  .map(user => ({ ...user, name: user.name.toUpperCase() })) // Transformation
  .toContext(USER_DATA) // Store result in context
```

## 2. Flow

A `Flow` is a special type of `Node` that acts as an orchestrator. It doesn't have its own business logic; instead, its purpose is to manage the execution of a graph of other nodes.

You create a `Flow` by giving it a starting node. The `Flow` then executes that node, looks at the **action** it returns, and finds the next node to run based on how you've connected them with `.next()`. This process repeats until a node returns an action that has no corresponding successor, at which point the flow ends.

```typescript
import { Node, Flow } from 'cascade'

// Create the nodes
const startNode = new Node()
const nextNode = new Node()

// Define the sequence
startNode.next(nextNode)

// Create and run the flow
const myFlow = new Flow(startNode)
await myFlow.run(context)
```

## 3. Context

The `Context` is the shared memory of a running workflow. It is an object that is passed to every single node, allowing different steps in the process to communicate and share state with each other.

- **Type-Safe by Default**: You interact with the context using `ContextKey`s, which are unique symbols tied to a specific type. This prevents you from accidentally reading or writing data of the wrong type.
- **Mutable**: The context is designed to be mutated. Nodes typically read from the context in their `prep` phase and write back to it in their `post` phase.
- **Isolated from `exec`**: By design, the `exec` phase of a `Node` does not receive the context directly. This encourages writing pure, testable business logic that is independent of the workflow's state.

```typescript
import { TypedContext, contextKey } from 'cascade'

// Define a key
const USER_ID = contextKey<number>('user_id')

// Create a context with initial data
const context = new TypedContext([
  [USER_ID, 42]
])

// A node can retrieve the data in a type-safe way
const id = context.get(USER_ID) // id is of type `number | undefined`
```

## 4. Actions & Branching

An **action** is a string returned by a node's `post()` method. The `Flow` uses this string to determine which path to take next in the workflow graph.

- **`DEFAULT_ACTION`**: If you don't return a specific string, a special `symbol` is used as the default action. This is for simple, linear sequences. `nodeA.next(nodeB)` is shorthand for `nodeA.next(nodeB, DEFAULT_ACTION)`.

- **Custom Actions**: Returning a custom string from `post()` enables conditional branching.

```typescript
import { Node, Flow } from 'cascade'

class CheckStatusNode extends Node<void, string, 'ok' | 'error'> {
  async exec(): Promise<string> {
    const status = await someApiCall()
    return status
  }
  async post({ execRes: status }) {
    return status === 'success' ? 'ok' : 'error'
  }
}

const checkNode = new CheckStatusNode()
const successNode = new Node()
const errorNode = new Node()

// Branching based on the action string
checkNode.next(successNode, 'ok')
checkNode.next(errorNode, 'error')

const flow = new Flow(checkNode)
```

When `flow` runs, it will execute `checkNode`. If `post()` returns `'ok'`, `successNode` will run next. If it returns `'error'`, `errorNode` will run.
