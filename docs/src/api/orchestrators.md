# Orchestrators

The `IOrchestrator` interface allows you to customize how a workflow is executed. By default, Flowcraft uses the [`DefaultOrchestrator`](/api/orchestrators#defaultorchestrator-class), which can handle both standard and awaitable workflows. You can implement custom orchestrators for different execution strategies.

## `IOrchestrator` Interface

```typescript
export interface IOrchestrator {
	run(
		traverser: GraphTraverser,
		executorFactory: NodeExecutorFactory,
		initialState: WorkflowState<any>,
		services: ExecutionServices,
		blueprint: WorkflowBlueprint,
		functionRegistry: Map<string, any> | undefined,
		executionId: string,
		evaluator: IEvaluator,
		signal?: AbortSignal,
		concurrency?: number,
	): Promise<WorkflowResult<any>>
}
```

## `ExecutionServices` Interface

```typescript
export interface ExecutionServices {
	determineNextNodes: (
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<any>,
		executionId?: string,
	) => Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]>
	applyEdgeTransform: (
		edge: EdgeDefinition,
		sourceResult: NodeResult<any, any>,
		targetNode: NodeDefinition,
		context: ContextImplementation<any>,
		allPredecessors?: Map<string, Set<string>>,
	) => Promise<void>
	resolveNodeInput: (nodeId: string, blueprint: WorkflowBlueprint, context: any) => Promise<any>
	options: {
		signal?: AbortSignal
		concurrency?: number
		serializer: any
	}
}
```

## `DefaultOrchestrator` Class

The `DefaultOrchestrator` is the default orchestrator that executes a workflow from start to finish, but can gracefully pause when encountering wait nodes or awaiting subflows. It replaces the `RunToCompletionOrchestrator` for better support of human-in-the-loop workflows.

### `constructor()`

Creates a new `DefaultOrchestrator` instance.

### `.run(...)`

Executes a workflow, checking for awaiting state after each batch and pausing if necessary.

- **`traverser`** `GraphTraverser`: The graph traverser managing the workflow execution state.
- **`executorFactory`** `NodeExecutorFactory`: Factory for creating node executors.
- **`state`** `WorkflowState<any>`: The current workflow state.
- **`services`** `ExecutionServices`: Execution services including options and utilities.
- **`blueprint`** `WorkflowBlueprint`: The workflow blueprint.
- **`functionRegistry`** `Map<string, any> | undefined`: Optional function registry for node implementations.
- **`executionId`** `string`: Unique identifier for this execution.
- **`evaluator`** `IEvaluator`: Expression evaluator for conditions and transforms.
- **`signal?`** `AbortSignal`: Optional abort signal for cancellation.
- **`concurrency?`** `number`: Optional concurrency limit for node execution.
- **Returns**: `Promise<WorkflowResult<any>>`: The result of the workflow execution.

## `RunToCompletionOrchestrator` Class

The `RunToCompletionOrchestrator` is an alias for `DefaultOrchestrator` and is maintained for backward compatibility. It executes a workflow from start to finish in a single, blocking operation.

### `constructor()`

Creates a new `RunToCompletionOrchestrator` instance.

### `.run(...)`

Executes a workflow using the run-to-completion strategy.

- **`traverser`** `GraphTraverser`: The graph traverser managing the workflow execution state.
- **`executorFactory`** `NodeExecutorFactory`: Factory for creating node executors.
- **`state`** `WorkflowState<any>`: The current workflow state.
- **`services`** `ExecutionServices`: Execution services including options and utilities.
- **`blueprint`** `WorkflowBlueprint`: The workflow blueprint.
- **`functionRegistry`** `Map<string, any> | undefined`: Optional function registry for node implementations.
- **`executionId`** `string`: Unique identifier for this execution.
- **`evaluator`** `IEvaluator`: Expression evaluator for conditions and transforms.
- **`signal?`** `AbortSignal`: Optional abort signal for cancellation.
- **`concurrency?`** `number`: Optional concurrency limit for node execution.
- **Returns**: `Promise<WorkflowResult<any>>`: The result of the workflow execution.

For examples of custom orchestrators, see [Orchestrators Guide](/guide/orchestrators).

## Helper Functions

### `executeBatch(...)`

Executes a batch of ready nodes with concurrency control.

- **`readyNodes`** `Array<{ nodeId: string; nodeDef: any }>`: The nodes ready for execution.
- **`blueprint`** `WorkflowBlueprint`: The workflow blueprint.
- **`state`** `WorkflowState<any>`: The current workflow state.
- **`executorFactory`** `NodeExecutorFactory`: Factory for creating node executors.
- **`services`** `ExecutionServices`: Execution services including options and utilities.
- **`maxConcurrency?`** `number`: Optional maximum number of nodes to execute concurrently.
- **Returns**: `Promise<Array<{ status: 'fulfilled' | 'rejected'; value: ...; reason: ... }>>`: The execution results.

### `processResults(...)`

Processes the results of node executions, updates state, handles dynamic nodes, and determines next nodes.

- **`settledResults`** `Array<...>`: The results from `executeBatch`.
- **`traverser`** `GraphTraverser`: The graph traverser managing execution state.
- **`state`** `WorkflowState<any>`: The current workflow state.
- **`services`** `ExecutionServices`: Execution services including options and utilities.
- **`blueprint`** `WorkflowBlueprint`: The workflow blueprint.
- **`executorFactory`** `NodeExecutorFactory`: Factory for creating node executors.
- **`executionId?`** `string`: Optional execution identifier.
- **Returns**: `Promise<void>`

These helper functions are used internally by the `DefaultOrchestrator` and can be leveraged when building custom orchestrators.
