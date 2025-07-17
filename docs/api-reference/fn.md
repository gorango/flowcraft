# API Reference: Functional Helpers

This document covers the functions provided by Cascade for a more functional-style approach to creating `Node` instances and simple workflows. All helpers are imported from the main `cascade` package.

```typescript
import {
  mapNode,
  contextNode,
  transformNode,
  pipeline,
} from 'cascade'
```

## `mapNode<TIn, TOut>(fn)`

Creates a `Node` from a simple, pure function that transforms an input to an output. The node's `params` object is passed as the single argument to the provided function `fn`. The result of `fn` becomes the `exec` result of the node.

### Parameters

- `fn: (input: TIn) => TOut | Promise<TOut>`: A synchronous or asynchronous function that takes an input object and returns a result. `TIn` corresponds to the type of the node's `params`.

### Returns

- `Node<TIn, TOut>`: A new `Node` instance that wraps the function.

### Example

```typescript
import { mapNode } from 'cascade'

// Define a reusable node that doubles the 'value' param
const doublerNode = mapNode((params: { value: number }) => params.value * 2)

// Use it in a flow
doublerNode.withParams({ value: 5 }) // This node will produce the result 10
```

## `contextNode<TIn, TOut>(fn)`

Creates a `Node` from a function that requires access to the shared `Context` in addition to its `params`.

### Parameters

- `fn: (ctx: Context, input: TIn) => TOut | Promise<TOut>`: A function that takes the `Context` as its first argument and the node's `params` as its second. The result of `fn` becomes the `exec` result of the node.

### Returns

- `Node<TIn, TOut>`: A new `Node` instance that wraps the function.

### Example

```typescript
import { contextNode, contextKey } from 'cascade'

const USER_NAME = contextKey<string>('user_name')

// A node that constructs a greeting using a value from the context
const greetingNode = contextNode((ctx) => `Hello, ${ctx.get(USER_NAME)}!`)
```

## `transformNode(...transforms)`

Creates a `Node` that is used purely for its side effect of modifying the `Context`. It does not produce an `exec` result. Its logic runs in the `prep` phase.

### Parameters

- `...transforms: ContextTransform[]`: A sequence of `ContextTransform` functions. A `ContextTransform` is a function of the shape `(ctx: Context) => Context`. These are often created using a `ContextLens`.

### Returns

- `Node`: A new `Node` instance that will apply the context transformations when it runs.

### Example

```typescript
import { transformNode, lens } from 'cascade'

const NAME = contextKey<string>('name')
const AGE = contextKey<number>('age')
const nameLens = lens(NAME)
const ageLens = lens(AGE)

// A single node that sets both name and age in the context
const setupContextNode = transformNode(
  nameLens.set('Alice'),
  ageLens.set(30)
)
```

## `pipeline(...nodes)`

A functional-style alias for the `SequenceFlow` builder. It constructs a linear `Flow` where each node executes in the order it is provided.

### Parameters

- `...nodes: Node[]`: A sequence of `Node` instances to chain together.

### Returns

- `Flow`: A `Flow` instance representing the linear sequence.

### Example

```typescript
import { pipeline, Node } from 'cascade'

const nodeA = new Node()
const nodeB = new Node()
const nodeC = new Node()

const myPipeline = pipeline(nodeA, nodeB, nodeC)
// This is equivalent to: new SequenceFlow(nodeA, nodeB, nodeC)
```
