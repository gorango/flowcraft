# Core Concepts

Flowcraft is built on a few simple but powerful concepts. Understanding them is key to building effective workflows. You can also review the [API Reference Overview](/api/) for more technical details.

## 1. Workflow Blueprint

A [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) is a JSON-serializable object that declaratively defines your workflow's structure. It's the "data" part of the "functions as data" philosophy.

A blueprint consists of:
-   **`id`**: A unique identifier for the workflow.
-   **`nodes`**: An array of [`NodeDefinition`](/api/nodes-and-edges#nodedefinition-interface) objects, representing the tasks to be executed.
-   **`edges`**: An array of [`EdgeDefinition`](/api/nodes-and-edges#edgedefinition-interface) objects, defining the dependencies and data flow between nodes.

```typescript
interface WorkflowBlueprint {
	id: string
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	metadata?: Record<string, any>
}
```

Because blueprints are just data, they can be stored as JSON, sent over a network, or generated dynamically.

## 2. Nodes

A node represents a single unit of work in your workflow.It encapsulates the logic you want to execute. For a detailed guide, see [Nodes and Edges](/guide/nodes-and-edges). Flowcraft supports two ways to define node logic:

-   **Function-based**: A simple `async` function that receives a [`NodeContext`](/api/nodes-and-edges#nodecontext-interface) and returns a [`NodeResult`](/api/nodes-and-edges#noderesult-interface). Ideal for simple, self-contained tasks.
-   **Class-based**: A class that extends [`BaseNode`](/api/nodes-and-edges#basenode-abstract-class). This provides a more structured lifecycle (`prep`, `exec`, `post`, `fallback`, `recover`), which is useful for complex logic, dependency injection, and testability.

## 3. Context

The [`Context`](/api/context#context-class) is the strongly-typed, shared state of a running workflow. It's a key-value store where nodes can read and write data with compile-time type safety. For example, an early node might fetch user data and save it to the context, allowing a later node to read that user data and perform an action with full type checking. Learn more about [Context Management](/guide/context-management).

Flowcraft provides two strongly-typed context interfaces:
-   **[`ISyncContext<TContext>`](/api/context#isynccontext-interface)**: A high-performance, in-memory context used for local execution with full type safety.
-   **[`IAsyncContext<TContext>`](/api/context#iasynccontext-interface)**: A promise-based interface designed for distributed systems where state might be stored in a remote database like Redis, maintaining type safety across distributed execution.

Nodes always interact with an [`IAsyncContext<TContext>`](/api/context#iasynccontext-interface) view, ensuring your business logic remains consistent and type-safe whether you run locally or distributed.

**Type Safety Benefits:**
- Define your context shape upfront with TypeScript interfaces
- Get compile-time validation for context key access
- Receive precise type inference for context values
- Catch type mismatches during development, not runtime

## 4. Runtime

The [`FlowRuntime`](/api/runtime#flowruntime-class) is the engine that executes a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface). It takes the blueprint and an initial context, then traverses the graph, executing each node in the correct order. For production use, you can configure concurrency limits to control resource usage during execution. See the [Runtime API docs](/api/runtime) for configuration options.

The runtime is responsible for:
-   Managing the workflow's state (the Context).
-   Handling retries and fallbacks.
-   Evaluating edge conditions to determine the next nodes to run.
-   Injecting dependencies and middleware.
-   Orchestrating both in-memory and distributed execution.

## 5. Dependency Injection Container

The [`DIContainer`](/api/container#dicontainer-class) implements the Inversion of Control (IoC) principle, allowing components to receive dependencies from a central container rather than creating them directly. This promotes loose coupling, making the framework highly configurable, testable, and extensible.

### Benefits
-   **Loose Coupling**: Components depend only on interfaces, not concrete implementations.
-   **Centralized Configuration**: All "wiring" is defined in one place via the container.
-   **Easy Testing**: Inject mocks or stubs directly into the container for isolated testing.
-   **Pluggable Architecture**: Swap implementations (e.g., loggers, serializers) without changing code.

### Key Components
-   **Service Tokens**: Symbolic identifiers (e.g., `ServiceTokens.Logger`) for type-safe service resolution.
-   **Registration**: Services can be registered directly or via factories for lazy instantiation.
-   **Resolution**: Retrieve services by token, with automatic dependency injection.

For usage examples, see [Getting Started](/guide/getting-started) and the [Container API docs](/api/container).

## 6. Human-in-the-Loop (HITL) Orchestration

Flowcraft supports human-in-the-loop workflows, allowing workflows to pause at defined points and await external input before resuming. This is essential for interactive processes like approvals or manual interventions.

### Key Features

- **Wait Nodes**: Use the `.wait()` method in the `Flow` builder to create pause points.
- **Multiple Concurrent Waits**: Support for multiple wait nodes running in parallel, each tracked separately in the workflow state.
- **Awaiting Status**: Workflows in a paused state have a status of `'awaiting'`.
- **Resume Functionality**: Use the `runtime.resume()` method with an optional `nodeId` parameter to specify which waiting node to resume.
- **State Persistence**: Awaiting state is preserved in the serialized context for durability.

### Workflow Statuses

Workflows can have the following statuses:
- **`completed`**: Execution finished successfully.
- **`failed`**: Execution failed with errors.
- **`stalled`**: Execution cannot proceed due to unresolved dependencies.
- **`cancelled`**: Execution was cancelled.
- **`awaiting`**: Execution is paused at a wait node, waiting for external input.

For more details, see [Defining Workflows](/guide/defining-workflows) and the [Runtime API](/api/runtime).
