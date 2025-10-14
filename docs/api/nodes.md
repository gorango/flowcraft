# API: Nodes

This section covers the core types and classes for defining the logic of your workflow tasks.

## `NodeDefinition` Interface

This is the serializable representation of a node within a `WorkflowBlueprint`.

```typescript
interface NodeDefinition {
  id: string;
  uses: string; // Key that resolves to an implementation in a registry.
  params?: Record<string, any>;
  inputs?: string | Record<string, string>;
  config?: NodeConfig;
}```

## `NodeConfig` Interface

Configuration for a node's resiliency and execution behavior.

```typescript
interface NodeConfig {
  maxRetries?: number;
  fallback?: string; // ID of a fallback node.
  joinStrategy?: 'all' | 'any'; // For nodes with multiple inputs.
}
```

## `NodeResult` Interface

The required return type for any node implementation.

```typescript
interface NodeResult<TOutput = any> {
  output?: TOutput;
  action?: string; // For conditional branching.
  error?: { message: string, [key: string]: any };
  dynamicNodes?: NodeDefinition[]; // For dynamically scheduling new nodes.
}```

## `NodeContext` Interface

The context object passed to every node's execution logic.

```typescript
interface NodeContext<TContext, TDependencies> {
  context: IAsyncContext<TContext>;
  input?: any;
  params: Record<string, any>;
  dependencies: TDependencies;
  signal?: AbortSignal;
}
```

## `NodeFunction` Type

A simple, function-based node implementation.

```typescript
type NodeFunction = (context: NodeContext) => Promise<NodeResult>
```

## `BaseNode` Abstract Class

A structured, class-based node for complex logic with a safe, granular lifecycle.

### `constructor(params)`
-   **`params`**: Static parameters for this node instance, passed from the `NodeDefinition`.

### `async prep(context)`
Phase 1: Gathers and prepares data for execution. This phase is **not** retried.
-   **`context`**: The node's `NodeContext`.
-   **Returns**: `Promise<any>` - The data needed for the `exec` phase.

### `abstract async exec(prepResult, context)`
Phase 2: Performs the core, isolated logic. This is the **only** phase that is retried.
-   **`prepResult`**: The data returned from the `prep` phase.
-   **`context`**: The node's `NodeContext`.
-   **Returns**: `Promise<Omit<NodeResult, 'error'>>`

### `async post(execResult, context)`
Phase 3: Processes the result and saves state. This phase is **not** retried.
-   **`execResult`**: The successful result from the `exec` or `fallback` phase.
-   **`context`**: The node's `NodeContext`.
-   **Returns**: `Promise<NodeResult>`

### `async fallback(error, context)`
An optional safety net that runs if all `exec` retries fail.
-   **`error`**: The final error from the last `exec` attempt.
-   **`context`**: The node's `NodeContext`.
-   **Returns**: `Promise<Omit<NodeResult, 'error'>>`
