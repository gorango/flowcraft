# Nodes and Edges

This section covers the core types and classes for defining the logic of your workflow tasks and the connections between them.

## `NodeDefinition` Interface

This is the serializable representation of a node within a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

```typescript
interface NodeDefinition {
   id: string;
   uses: string; // Key that resolves to an implementation in a registry.
   params?: Record<string, any>;
   inputs?: string | Record<string, string>;
   config?: NodeConfig;
}
```

### Built-in Node Types

Flowcraft provides several built-in node types for common patterns:

- **`wait`**: Pauses workflow execution for external input (human-in-the-loop).
- **`subflow`**: Executes a nested workflow.
- **`batch-scatter`**: Splits an array for parallel processing.
- **`batch-gather`**: Collects results from parallel workers.
- **`loop-controller`**: Manages iterative loops.

## `EdgeDefinition` Interface

Defines the connection and data flow between two nodes.

```typescript
interface EdgeDefinition {
  source: string;
  target: string;
  action?: string; // An 'action' from the source node that triggers this edge.
  condition?: string; // A condition that must be met for this edge to be taken.
  transform?: string; // A string expression to transform the data before passing it to the target node.
}
```

## `NodeConfig` Interface

Configuration for a node's resiliency and execution behavior.

```typescript
interface NodeConfig {
   maxRetries?: number; // Number of retries on failure (default: 0)
   retryDelay?: number; // Delay in ms between retries (default: 1000)
   timeout?: number; // Timeout in ms for the node execution
   fallback?: string; // ID of a fallback node to run on failure
   joinStrategy?: 'all' | 'any'; // For nodes with multiple inputs: wait for all or any
}
```

Example usage:

```typescript
.node('flaky-api', async ({ input }) => {
  // Some API call that might fail
  return { output: await callExternalAPI(input) }
}, {
  config: {
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 5000,
    fallback: 'fallback-node',
    joinStrategy: 'any'
  }
})
```

## `NodeResult` Interface

The required return type for any node implementation.

```typescript
interface NodeResult<TOutput = any, TAction extends string = string> {
   output?: TOutput;
   action?: TAction; // For conditional branching.
   error?: { message: string, [key: string]: any };
   dynamicNodes?: NodeDefinition[]; // For dynamically scheduling new nodes.
   _fallbackExecuted?: boolean; // Internal flag: Indicates that this result came from a fallback execution.
}
```

## `NodeContext` Interface

The context object passed to every node's execution logic.

```typescript
interface NodeContext<
   TContext extends Record<string, any> = Record<string, any>,
   TDependencies extends RuntimeDependencies = RuntimeDependencies,
   TInput = any,
 > {
   /** The async-only interface for interacting with the workflow's state. */
   context: IAsyncContext<TContext>;
   /** The primary input data for this node, typically from its predecessor. */
   input?: TInput;
   /** Static parameters defined in the blueprint. */
   params: Record<string, any>;
   /** Shared, runtime-level dependencies (e.g., database clients, loggers). */
   dependencies: TDependencies & {
     runtime: ExecutionContext<TContext, TDependencies>;
     workflowState: WorkflowState<TContext>;
   };
   /** A signal to gracefully cancel long-running node operations. */
   signal?: AbortSignal;
}
```

## `NodeFunction` Type

A simple, function-based node implementation.

```typescript
type NodeFunction<
   TContext = Record<string, any>,
   TDependencies = RuntimeDependencies,
   TInput = any,
   TOutput = any,
   TAction extends string = string,
 > = (context: NodeContext<TContext, TDependencies, TInput>) => Promise<NodeResult<TOutput, TAction>>
 ```

## `NodeClass` Type

Represents a constructor for any concrete class that extends the abstract `BaseNode`.

```typescript
type NodeClass<
   TContext = Record<string, any>,
   TDependencies = RuntimeDependencies,
   TInput = any,
   TOutput = any,
   TAction extends string = string,
 > = new (params?: Record<string, any>, nodeId?: string) => BaseNode<TContext, TDependencies, TInput, TOutput, TAction>
 ```

## `isNodeClass` Function

A type guard to reliably distinguish a `NodeClass` from a `NodeFunction`.

```typescript
function isNodeClass(impl: any): impl is NodeClass {
  return typeof impl === 'function' && !!impl.prototype?.exec
}
```

This is useful when you need to check if a node implementation is a class-based one, for example, when registering nodes dynamically.

## `BaseNode` Abstract Class

A structured, class-based node for complex logic with a safe, granular lifecycle.

```typescript
abstract class BaseNode<
   TContext = Record<string, any>,
   TDependencies = RuntimeDependencies,
   TInput = any,
   TOutput = any,
   TAction extends string = string,
 > {
   constructor(params: Record<string, any>) {
     // Initialize with params
   }

   async prep(context: NodeContext<TContext, TDependencies, TInput>): Promise<any> {
     // Prepare data
     return await context.context.get('someData')
   }

   abstract async exec(prepResult: any, context: NodeContext<TContext, TDependencies, TInput>): Promise<Omit<NodeResult<TOutput, TAction>, 'error'>>

   async post(execResult: Omit<NodeResult<TOutput, TAction>, 'error'>, context: NodeContext<TContext, TDependencies, TInput>): Promise<NodeResult<TOutput, TAction>> {
     // Process result
     await context.context.set('result', execResult.output)
     return execResult
   }

   async fallback(error: Error, context: NodeContext<TContext, TDependencies, TInput>): Promise<Omit<NodeResult<TOutput, TAction>, 'error'>> {
     // Fallback logic
     return { output: 'Fallback result' }
   }

   async recover(error: Error, context: NodeContext<TContext, TDependencies, TInput>): Promise<void> {
     // Cleanup
   }
 }
```

Example implementation:

```typescript
class MyNode extends BaseNode {
  async prep(context) {
    return await context.context.get('userId')
  }

  async exec(userId, context) {
    const user = await fetchUser(userId)
    return { output: user, action: 'success' }
  }

  async post(execResult, context) {
    await context.context.set('processedUser', execResult.output)
    return execResult
  }
}
```
