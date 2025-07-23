# Functional API

While Cascade's core is built on composable classes like `Node` and `Flow`, it also provides a suite of functional helpers for developers who prefer a more functional programming style. These helpers allow you to define nodes and simple pipelines without explicitly creating new classes.

All helpers are imported from the main `cascade` package.

```typescript
import {
  mapNode,
  contextNode,
  transformNode,
  pipeline,
  lens,
  composeContext
} from 'cascade'
```

## Creating Nodes from Functions

These helpers are the primary way to create `Node` instances from simple functions.

### `mapNode`

`mapNode` creates a `Node` from a pure function that transforms an input to an output. The node's input `params` object is passed as the single argument to your function.

#### When to Use

Use `mapNode` for simple, stateless transformations where the logic doesn't need access to the shared `Context`.

#### Example

```typescript
import { mapNode, Flow } from 'cascade'

// A simple function that adds two numbers from the params
const add = (params: { a: number, b: number }) => params.a + params.b

// Create a reusable Node from the function
const addNode = mapNode(add)

// Now use it in a flow
const flow = new Flow(addNode.withParams({ a: 5, b: 10 }))
```

### `contextNode`

`contextNode` is similar to `mapNode`, but the function you provide also receives the `Context` as its first argument.

#### When to Use

Use `contextNode` when your node's logic depends on state stored in the `Context`.

#### Example

```typescript
import { contextNode, contextKey, TypedContext, Flow } from 'cascade'

const LANGUAGE = contextKey<'en' | 'es'>('language')

// A function that uses the context to determine the greeting
const greeter = (ctx, params: { name: string }) => {
  const lang = ctx.get(LANGUAGE) || 'en'
  return lang === 'es' ? `Hola, ${params.name}` : `Hello, ${params.name}`
}

// Create a Node from the context-aware function
const greetingNode = contextNode(greeter)

const context = new TypedContext([[LANGUAGE, 'es']])
const flow = new Flow(greetingNode.withParams({ name: 'Mundo' }))
```

## Creating Flows

### `pipeline`

`pipeline` is a functional alias for the `SequenceFlow` builder. It takes a sequence of `Node` instances and returns a `Flow` where they are all chained together in order.

#### When to Use

Use `pipeline` as a more readable, functional-style alternative to `new SequenceFlow(...)` for creating simple linear workflows.

#### Example

```typescript
import { pipeline, mapNode, contextNode } from 'cascade'

const fetchNode = mapNode(() => ({ user: 'Alice' }))
const processNode = mapNode((data) => `Processed ${data.user}`)
const saveNode = contextNode((ctx, result) => { /* save result */ })

const dataPipeline = pipeline(
  fetchNode,
  processNode,
  saveNode
)

await dataPipeline.run(context)
```

## Declarative Context Management

These helpers provide a functional way to manage state in the `Context`.

### `lens` and `transformNode`

A `lens` provides a way to "focus" on a single key in the `Context`, allowing you to create reusable functions that `get`, `set`, or `update` its value.

`transformNode` is a special `Node` that takes these functions and applies them to the context. It's the ideal way to set up initial state for a workflow.

#### When to Use

Use this combination for declaratively setting up or mutating state in the `Context` as a distinct step in your workflow.

#### Example

```typescript
import { transformNode, lens, contextKey } from 'cascade'

const USER_ID = contextKey<string>('user_id')
const ATTEMPTS = contextKey<number>('attempts')

// Create lenses to focus on our specific context keys
const userIdLens = lens(USER_ID)
const attemptsLens = lens(ATTEMPTS)

// A node that sets an initial user and resets the attempt counter.
// The `set` and `update` methods from the lens return `ContextTransform` functions.
const setupContextNode = transformNode(
  userIdLens.set('user-123'),
  attemptsLens.update(current => (current || 0) + 1) // Safely increments
)
```
