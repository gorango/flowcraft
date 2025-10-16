# Middleware API

The `Middleware` interface allows you to inject cross-cutting concerns into workflow execution. Middleware can wrap node executions, run before or after nodes, and is essential for features like observability, transactions, and logging.

## Interface Definition

```typescript
export interface Middleware<TContext extends Record<string, any> = Record<string, any>> {
	beforeNode?: (ctx: ContextImplementation<TContext>, nodeId: string) => void | Promise<void>
	afterNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		result: NodeResult | undefined,
		error: Error | undefined,
	) => void | Promise<void>
	aroundNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	) => Promise<NodeResult>
}
```

## Hooks

### `beforeNode`

Runs before a node executes. Useful for setup or logging.

- **Parameters:**
  - `ctx`: The workflow context
  - `nodeId`: The ID of the node about to execute

### `afterNode`

Runs after a node executes, regardless of success or failure.

- **Parameters:**
  - `ctx`: The workflow context
  - `nodeId`: The ID of the executed node
  - `result`: The result of the node execution (undefined if error)
  - `error`: The error thrown (undefined if success)

### `aroundNode`

Wraps the entire node execution. This is the most powerful hook as it can control the execution flow.

- **Parameters:**
  - `ctx`: The workflow context
  - `nodeId`: The ID of the node being executed
  - `next`: Function to call to proceed with execution
- **Returns:** The [`NodeResult`](/api/nodes-and-edges#noderesult-interface) from the node or modified result

## Usage with FlowRuntime

Middleware is provided to the [`FlowRuntime`](/api/runtime#flowruntime-class) constructor:

```typescript
const runtime = new FlowRuntime({
  middleware: [myMiddleware1, myMiddleware2],
})
```

Middleware executes in LIFO order (last in, first out).

## Built-in Middleware

- **[`@flowcraft/opentelemetry-middleware`](https://www.npmjs.com/package/@flowcraft/opentelemetry-middleware)**: Provides distributed tracing using [OpenTelemetry](https://opentelemetry.io/) standards.

For examples, see the [Middleware Guide](/guide/middleware).
