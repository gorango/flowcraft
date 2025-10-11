# API Reference Overview

This section provides detailed technical documentation for the Flowcraft API. It is intended for developers who are familiar with the [Core Concepts](/guide/core-concepts/) and are looking for specific details on classes, interfaces, and functions.

### Key Modules

The Flowcraft API is organized into several key modules, each responsible for a specific aspect of the framework.

-   **[Flow (`createFlow`)](/api-reference/flow)**: The fluent builder API for programmatically constructing a `WorkflowBlueprint`.
-   **[Runtime (`FlowRuntime`)](/api-reference/runtime)**: The engine responsible for executing workflows.
-   **[Nodes](/api-reference/nodes)**: The interfaces and base classes for defining node implementations (`BaseNode`, `NodeFunction`).
-   **[Context](/api-reference/context)**: The interfaces and classes for managing workflow state (`ISyncContext`, `IAsyncContext`).
-   **[Analysis](/api-reference/analysis)**: Utilities for validating and visualizing blueprints (`analyzeBlueprint`, `generateMermaid`).
-   **[Linter](/api-reference/linter)**: Tools for static analysis to find common errors before runtime.
-   **Extensibility Interfaces**:
    -   **[Serializer](/api-reference/serializer)**: The `ISerializer` interface for custom data serialization.
    -   **[Evaluator](/api-reference/evaluator)**: The `IEvaluator` interface for custom expression evaluation.
    -   **[Logger](/api-reference/logger)**: The `ILogger` interface for plugging in custom logging providers.
-   **[Errors](/api-reference/errors)**: Custom error classes thrown by the runtime.
-   **[Distributed Adapter](/api-reference/distributed-adapter)**: The base classes and interfaces for building distributed execution adapters.
