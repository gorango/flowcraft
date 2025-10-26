# Types

This page provides a reference for the core interfaces and types used throughout Flowcraft. These define the structure of workflows, nodes, edges, and execution contexts.

## Blueprint Interfaces

### `WorkflowBlueprint`

The central, serializable representation of a workflow. This is the declarative definition that can be stored as JSON or YAML.

```typescript
interface WorkflowBlueprint {
  id: string
  nodes: NodeDefinition[]
  edges: EdgeDefinition[]
  metadata?: Record<string, any>
}
```

- `id`: Unique identifier for the workflow.
- `nodes`: Array of node definitions.
- `edges`: Array of edge definitions connecting the nodes.
- `metadata`: Optional additional data.

### `NodeDefinition`

Defines a single step in the workflow.

```typescript
interface NodeDefinition {
  id: string
  uses: string
  params?: Record<string, any>
  inputs?: string | Record<string, string>
  config?: NodeConfig
}
```

- `id`: Unique identifier for the node.
- `uses`: Key that resolves to an implementation in the registry.
- `params`: Static parameters for the node.
- `inputs`: Maps context data to this node's input.
- `config`: Configuration for retries, timeouts, etc.

### `EdgeDefinition`

Defines the connection and data flow between two nodes.

```typescript
interface EdgeDefinition {
  source: string
  target: string
  action?: string
  condition?: string
  transform?: string
}
```

- `source`: ID of the source node.
- `target`: ID of the target node.
- `action`: Action from the source node that triggers this edge.
- `condition`: Condition that must be met for the edge to be taken.
- `transform`: Expression to transform data before passing to the target.

### `NodeConfig`

Configuration for a node's resiliency and behavior.

```typescript
interface NodeConfig {
  maxRetries?: number
  retryDelay?: number
  timeout?: number
  fallback?: string
  joinStrategy?: 'all' | 'any'
}
```

- `maxRetries`: Number of retry attempts on failure.
- `retryDelay`: Delay between retries in milliseconds.
- `timeout`: Maximum execution time in milliseconds.
- `fallback`: Uses key of fallback node.
- `joinStrategy`: How to trigger node with multiple incoming edges.

## Node Implementation Types

### `NodeResult<TOutput = any, TAction extends string = string>`

The required return type for any node implementation.

```typescript
interface NodeResult<TOutput = any, TAction extends string = string> {
  output?: TOutput
  action?: TAction
  error?: { message: string; [key: string]: any }
  dynamicNodes?: NodeDefinition[]
  _fallbackExecuted?: boolean
}
```

- `output`: The primary output of the node.
- `action`: Action to trigger specific edges.
- `error`: Error information if the node failed.
- `dynamicNodes`: Dynamically scheduled nodes.
- `_fallbackExecuted`: Internal flag for fallback execution.

### `NodeContext<TContext, TDependencies, TInput>`

The context object passed to every node's execution logic.

```typescript
interface NodeContext<TContext, TDependencies, TInput> {
  context: IAsyncContext<TContext>
  input?: TInput
  params: Record<string, any>
  dependencies: TDependencies & {
    runtime: ExecutionContext<TContext, TDependencies>
    workflowState: WorkflowState<TContext>
  }
  signal?: AbortSignal
}
```

- `context`: Interface for interacting with workflow state.
- `input`: Primary input data from predecessor.
- `params`: Static parameters from blueprint.
- `dependencies`: Shared runtime dependencies.
- `signal`: For graceful cancellation.

### `NodeFunction`

A simple function-based node implementation.

```typescript
type NodeFunction<TContext, TDependencies, TInput, TOutput, TAction> = (
  context: NodeContext<TContext, TDependencies, TInput>
) => Promise<NodeResult<TOutput, TAction>>
```

### `NodeClass`

Constructor for class-based node implementations.

```typescript
type NodeClass<TContext, TDependencies, TInput, TOutput, TAction> = new (
  params?: Record<string, any>,
  nodeId?: string
) => BaseNode<TContext, TDependencies, TInput, TOutput, TAction>
```

## Context Interfaces

### `ISyncContext<TContext>`

Synchronous context for in-memory state.

```typescript
interface ISyncContext<TContext> {
  readonly type: 'sync'
  get<K extends keyof TContext>(key: K): TContext[K] | undefined
  set<K extends keyof TContext>(key: K, value: TContext[K]): void
  has<K extends keyof TContext>(key: K): boolean
  delete<K extends keyof TContext>(key: K): boolean
  toJSON(): Record<string, any>
}
```

### `IAsyncContext<TContext>`

Asynchronous context for distributed state.

```typescript
interface IAsyncContext<TContext> {
  readonly type: 'async'
  get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined>
  set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void>
  has<K extends keyof TContext>(key: K): Promise<boolean>
  delete<K extends keyof TContext>(key: K): Promise<boolean>
  toJSON(): Promise<Record<string, any>>
}
```

## Runtime Types

### `WorkflowStatus`

Status of a workflow execution.

```typescript
type WorkflowStatus = 'completed' | 'failed' | 'stalled' | 'cancelled' | 'awaiting'
```

### `WorkflowResult<TContext>`

Final result of a workflow execution.

```typescript
interface WorkflowResult<TContext> {
  context: TContext
  serializedContext: string
  status: WorkflowStatus
  errors?: WorkflowError[]
}
```

### `RuntimeOptions<TDependencies>`

Configuration for the FlowRuntime.

```typescript
interface RuntimeOptions<TDependencies> {
  registry?: Record<string, NodeFunction | NodeClass | typeof BaseNode>
  blueprints?: Record<string, WorkflowBlueprint>
  dependencies?: TDependencies
  logger?: ILogger
  eventBus?: IEventBus
  evaluator?: IEvaluator
  middleware?: Middleware[]
  serializer?: ISerializer
  strict?: boolean
}
```

For more details on specific interfaces, see the related API pages like [Flow](/api/flow), [Runtime](/api/runtime), and [Context](/api/context).