# API Reference: Core Workflow

This document covers the core classes and types exported from the main `flowcraft` entry point. These are the fundamental building blocks of any workflow.

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

## `Node<PrepRes, ExecRes, PostRes, TParams>`

The base class for a single unit of work. It is generic over its lifecycle results and its static parameters.

- `PrepRes`: The type of data returned by the `prep` phase.
- `ExecRes`: The type of data returned by the `exec` phase.
- `PostRes`: The type of the "action" returned by the `post` phase.
- `TParams`: **(Optional)** The type of the static parameters object for the node. Defaults to `Params`.

### Constructor

`new Node(options?: NodeOptions)`

- `options`: An optional object to configure the node's behavior.
  - `maxRetries?: number`: Total number of `exec` attempts. Defaults to `1`.
  - `wait?: number`: Milliseconds to wait between failed `exec` attempts. Defaults to `0`.

### Lifecycle Methods

These methods are designed to be overridden in your custom `Node` subclasses.

- `async prep(args: NodeArgs<void, void, TParams>): Promise<PrepRes>`: Prepares data for execution. Runs before `exec`. Ideal for reading from the context.
- `async exec(args: NodeArgs<PrepRes, void, TParams>): Promise<ExecRes>`: Performs the core, isolated logic. Its result is passed to `post`. This is the only phase that is retried on failure.
- `async post(args: NodeArgs<PrepRes, ExecRes, TParams>): Promise<PostRes>`: Processes results and determines the next step. Runs after `exec`. Ideal for writing to the context. Should return an action string. The default return is `DEFAULT_ACTION`.
- `async execFallback(args: NodeArgs<PrepRes, void, TParams>): Promise<ExecRes>`: Runs if all `exec` retries fail. If not implemented, the error will be re-thrown.

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

## `Flow<PrepRes, ExecRes, TParams>`

A special `Node` that acts as a container for a graph of other nodes and their shared middleware.

`extends Node`

### Constructor

## `Flow<PrepRes, ExecRes, TParams>`

- `startNode`: The node where the flow's execution should begin.

### Methods

- `.use(fn: Middleware)`: Adds a middleware function that the `Executor` will apply to every node within this flow.
- `.start(node)`: Sets the starting node of the flow. Returns the start node.
- `.run(ctx, options?)`: Runs the entire flow using an `IExecutor`. This is the main entry point for executing a workflow. The method returns the action from the last node executed.
- `.exec(args)`: This lifecycle method is called when a `Flow` is used as a sub-flow (a node within another flow). It contains the logic to orchestrate the sub-flow's internal graph from start to finish.
- `.getNodeById(id: string | number): AbstractNode | undefined`: Finds a node within the flow's graph by its unique ID. This method performs a breadth-first search from the `startNode` and is useful for debugging or dynamic modifications of programmatically-built flows.

> [!WARNING]
> `.getNodeById()` traverses the graph on each call (O(V+E) complexity). For flows built with `GraphBuilder`, it is much more efficient to use the `nodeMap` returned by the `.build()` method for O(1) lookups.

## `IExecutor` and `InMemoryExecutor`

- `IExecutor`: The interface that defines the contract for a workflow execution engine.
- `InMemoryExecutor`: The standard `IExecutor` implementation for running flows in-memory. This is the default executor if none is provided.

### `InMemoryExecutor` Constructor

`new InMemoryExecutor()`

## `Context` and `TypedContext`

The shared memory of a workflow.

- `Context`: The interface that defines the contract for a context object.
- `TypedContext`: The standard `Map`-based implementation of the `Context` interface.

### `TypedContext` Constructor

`new TypedContext(initialData?)`

- `initialData`: An optional iterable (like an array of `[key, value]` pairs) to initialize the context with.

### Methods

- `.get<T>(key)`: Retrieves a value from the context. Can be called with a `ContextKey<T>` (returns `T | undefined`) or a `string` (returns `any`).
- `.set<T>(key, value)`: Stores a value in the context.
- `.has(key)`: Checks if a key exists in the context.

## `ContextKey` and `contextKey()`

The mechanism for type-safe access to the `Context`.

> [!IMPORTANT]
> Always prefer `contextKey()` over raw strings to access the context. This provides compile-time type checking and prevents common bugs from typos.

- `ContextKey<T>`: An opaque type representing a key for a value of type `T`.
- `contextKey<T>(description?: string)`: A factory function that creates a new, unique `ContextKey<T>`. The `description` is used for debugging and is not functionally significant.

## Logger Interfaces

- `Logger`: The interface that any logger passed to a flow must implement (`debug`, `info`, `warn`, `error`).
- `ConsoleLogger`: A default implementation that logs messages to the `console`, with support for configurable log levels.
- `NullLogger`: A default implementation that performs no action. This is the framework's default if no logger is provided, ensuring it is silent by default.

### `ConsoleLogger` Constructor

`new ConsoleLogger(options?: { level?: 'debug' | 'info' | 'warn' | 'error' })`

- `options.level`: The minimum level of messages to log. Defaults to `'info'`.

## Error Types

- `WorkflowError`: A custom error wrapper that provides context about a failure (`nodeName`, `phase`, `originalError`).
- `AbortError`: The error thrown when a workflow is cancelled via an `AbortSignal`.
