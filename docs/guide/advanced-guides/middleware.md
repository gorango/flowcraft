# Advanced Guide: Middleware

Middleware provides a powerful mechanism to hook into the execution of nodes within a `Flow`. It allows you to wrap the logic of every node, making it the ideal pattern for handling **cross-cutting concerns** without cluttering your business logic.

## What is Middleware?

A middleware is a function that sits between the `Executor` and the `Node` it is about to execute. It receives the node's arguments and a `next` function. The middleware can perform actions before calling `next()` to proceed with the node's execution, and after `next()` returns to process the result.

This is conceptually similar to middleware in web frameworks like Express or Koa.

## Common Use Cases

- **Logging**: Implement centralized, structured logging for every node's entry and exit.
- **Performance Monitoring**: Start a timer before `next()` and record the duration after it completes to measure how long each node takes.
- **Authentication/Authorization**: Check if the current context has valid credentials before allowing a node to run.
- **Transaction Management**: Start a database transaction before the first node in a flow and commit or roll it back after the flow completes.
- **Input/Output Validation**: Validate a node's parameters before execution or its results after execution.

## How to Use Middleware

You can add middleware to any `Flow` instance using the `.use()` method. You can add multiple middleware functions; they will be executed in the order they are added.

When an `Executor` runs a `Flow`, it is responsible for applying the flow's middleware to each node it executes.

### The Middleware Function Signature

A middleware function has the following signature:

```typescript
type Middleware = (args: NodeArgs, next: MiddlewareNext) => Promise<any>
type MiddlewareNext = (args: NodeArgs) => Promise<any>
```

- `args`: The `NodeArgs` object, containing the `ctx`, `params`, `logger`, etc., for the node about to be executed.
- `next`: A function that you must call to pass control to the next middleware in the chain, or to the node itself if it's the last one.

### Example: A Simple Logger Middleware

Let's create a middleware that logs the name of each node being executed and the time it took.

```typescript
// main.ts
import { Flow, Node, TypedContext } from 'cascade'

// A simple node that pauses for a moment
class SlowNode extends Node {
  async exec() {
    console.log('... SlowNode is doing work...')
    await new Promise(r => setTimeout(r, 50))
  }
}

// Our timing middleware
const timingMiddleware = async (args, next) => {
  // `args.name` holds the constructor name of the node being run
  console.log(`[Middleware] ===> Entering node: ${args.name}`)
  const startTime = Date.now()

  // Call `next()` to proceed with the node's execution
  const result = await next(args)

  const duration = Date.now() - startTime
  console.log(`[Middleware] <=== Exiting node: ${args.name} (took ${duration}ms)`)

  // Return the result from the node
  return result
}

// Create a flow with a couple of nodes
const flow = new Flow(new SlowNode())
flow.startNode.next(new SlowNode())

// Apply the middleware to the flow
flow.use(timingMiddleware)

// Run it
await flow.run(new TypedContext())
```

When you run this, the output will be:

```
[Middleware] ===> Entering node: SlowNode
... SlowNode is doing work...
[Middleware] <=== Exiting node: SlowNode (took 53ms)
[Middleware] ===> Entering node: SlowNode
... SlowNode is doing work...
[Middleware] <=== Exiting node: SlowNode (took 51ms)
```

Notice that the middleware wraps the individual `SlowNode` instances. If you have composed flows, the middleware from a parent flow will also wrap the sub-flow `Node` itself, providing a way to trace entry and exit into complex, nested logic.

## Execution Order

If you register multiple middleware functions, they execute in a "nested" or LIFO (Last-In, First-Out) order for the logic that comes *after* the `await next(args)` call.

```typescript
flow.use(async (args, next) => {
  console.log('MW1 Enter')
  await next(args)
  console.log('MW1 Exit')
})

flow.use(async (args, next) => {
  console.log('MW2 Enter')
  await next(args)
  console.log('MW2 Exit')
})
```

The execution order will be:

1. `MW1 Enter`
2. `MW2 Enter`
3. (Node Execution)
4. `MW2 Exit`
5. `MW1 Exit`

## Short-Circuiting

A middleware can prevent a node (and subsequent middleware) from running by simply not calling the `next()` function. This is useful for authorization checks or conditional execution.

```typescript
const IS_ADMIN_KEY = contextKey<boolean>('isAdmin');

const authMiddleware = async (args, next) => {
  const userIsAdmin = args.ctx.get(IS_ADMIN_KEY)

  if (!userIsAdmin) {
    console.log('[Auth] Access denied. Halting execution.')
    // Don't call next(), and return an action to stop the flow
    return 'access_denied'
  }

  // User is admin, proceed
  return next(args)
}

flow.use(authMiddleware)
```
