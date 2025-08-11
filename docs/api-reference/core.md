# API Reference: Core API

This document covers the core classes and types that form the foundation of Flowcraft. These are the fundamental building blocks of any workflow.

```typescript
import {
	Context,
	ContextKey,
	contextKey,
	Flow,
	InMemoryExecutor,
	Node,
	TypedContext,
	// ...and more
} from 'flowcraft'
```

## `Node<PrepRes, ExecRes, PostRes, TParams, TContext>`

The base class for a single unit of work. It is generic over its lifecycle results, its static parameters, and its context type.

- `PrepRes`: The type of data returned by the `prep` phase.
- `ExecRes`: The type of data returned by the `exec` phase.
- `PostRes`: The type of the "action" returned by the `post` phase.
- `TParams`: **(Optional)** The type of the static parameters object for the node. Defaults to `Params`.
- `TContext`: **(Optional)** The type of the context object. Defaults to `Context`.

### Constructor

`new Node(options?: NodeOptions)`

- `options`: An optional object to configure the node's behavior.
  - `maxRetries?: number`: Total number of `exec` attempts. Defaults to `1`.
  - `wait?: number`: Milliseconds to wait between failed `exec` attempts. Defaults to `0`.

### Lifecycle Methods

These `async` methods are designed to be overridden in your custom `Node` subclasses.

- `async prep(args: NodeArgs)`: Prepares data for execution. Runs before `exec`. Ideal for reading from the context.
- `async exec(args: NodeArgs)`: Performs the core, isolated logic. Its result is passed to `post`. This is the only phase that is retried on failure.
- `async post(args: NodeArgs)`: Processes results and determines the next step. Runs after `exec`. Ideal for writing to the context. Returns an action. The default is `DEFAULT_ACTION`.
- `async execFallback(args: NodeArgs)`: Runs if all `exec` retries fail. If not implemented, the error will be re-thrown.

### Fluent API Methods

> [!IMPORTANT]
> These methods are **immutable**. They return a *new* `Node` instance for creating data processing pipelines and do not modify the original node. You must chain them or assign the result to a new variable.

- `.map<NewRes>(fn)`: Transforms the `exec` result into a new type.
- `.toContext(key)`: Stores the `exec` result in the `Context` using the provided `ContextKey`.
- `.filter(predicate)`: Conditionally proceeds. Returns `DEFAULT_ACTION` if the predicate is true, `FILTER_FAILED` otherwise.
- `.tap(fn)`: Performs a side-effect with the `exec` result without modifying it.
- `.withLens(lens, value)`: Applies a context mutation using a `ContextLens` before this node's `prep` phase.

### Other Methods

- `.next(node, action?)`: Connects this node to a successor. Returns the successor node for chaining.
- `.withParams(params: Partial<TParams>)`: Sets or merges type-safe parameters for the node.
- `.withId(id: string | number)`: Sets a unique identifier for this node instance.
- `.run(ctx, options?)`: Runs the node as a standalone unit using an `IExecutor`.

## Simplified Base Classes

To reduce boilerplate for common patterns, Flowcraft provides specialized abstract base classes that extend `Node`.

-   **`ExecNode`**: For nodes that only need a core `exec` method.
-   **`PreNode`**: For nodes that only perform a side-effect in the `prep` phase.
-   **`PostNode`**: For nodes that only make a branching decision in the `post` phase.

## `Flow<PrepRes, ExecRes, TParams, TContext>`

A special `Node` that acts as a container for a graph of other nodes and their shared middleware.

`extends Node`

### Constructor

`new Flow(start?: AbstractNode)`

- `startNode`: **(Optional)** The node where the flow's execution should begin.

### Methods

- `.use(fn: Middleware)`: Adds a middleware function that the `Executor` will apply to every node within this flow.
- `.start(node)`: Sets the starting node of the flow. Returns the start node.
- `.run(ctx, options?)`: Runs the entire flow using an `IExecutor`. This is the main entry point for executing a workflow.
- `.getNodeById(id: string | number): AbstractNode | undefined`: Finds a node within the flow's graph by its unique ID.

> [!WARNING]
> `.getNodeById()` traverses the graph on each call (O(V+E) complexity). For flows built with `GraphBuilder`, it is much more efficient to use the `nodeMap` returned by the `.build()` method for O(1) lookups.

## `IExecutor` and `InMemoryExecutor`

- `IExecutor`: The interface that defines the contract for a workflow execution engine.
- `InMemoryExecutor`: The standard `IExecutor` implementation for running flows in-memory. This is the default executor if none is provided.

## `Context` and `TypedContext`

The shared memory of a workflow.

- `Context`: The interface that defines the contract for a context object. All its methods are asynchronous.
- `TypedContext`: The standard `Map`-based implementation of the `Context` interface.

### Methods (`async`)

- `.get<T>(key)`: Asynchronously retrieves a value from the context.
- `.set<T>(key, value)`: Asynchronously stores a value in the context.
- `.has(key)`: Asynchronously checks if a key exists in the context.

## `ContextKey` and `contextKey()`

The mechanism for type-safe access to the `Context`.

> [!IMPORTANT]
> For in-memory workflows, always prefer `contextKey()` over raw strings to access the context. This provides compile-time type checking and prevents common bugs from typos. For distributed workflows, you must use serializable string keys.

- `contextKey<T>(description?: string)`: A factory function that creates a new, unique `ContextKey<T>`.

## Logger Interfaces

- `Logger`: The interface that any logger passed to a flow must implement (`debug`, `info`, `warn`, `error`).
- `ConsoleLogger`: A default implementation that logs messages to the `console`.
- `NullLogger`: A "no-op" implementation. **This is the framework's default logger, ensuring Flowcraft is silent out-of-the-box.**

## Error Types

- `WorkflowError`: A custom error wrapper that provides context about a failure (`nodeName`, `phase`, `originalError`).
- `FatalWorkflowError`: A subclass that signals a non-recoverable failure, halting the workflow immediately.
- `AbortError`: The error thrown when a workflow is cancelled via an `AbortSignal`.
