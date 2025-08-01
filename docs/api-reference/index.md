# API Reference

This section provides a detailed, technical breakdown of the core classes, functions, and types available in the Flowcraft framework. It is intended as a reference for when you know what component you need to use and want to understand its specific capabilities.

All components are imported from the main `flowcraft` package. For a more narrative-driven explanation of these concepts, please see the **[Guide](../guide/)**.

## Core Workflow API

This is the main entry point for the most essential components of the framework.

- **[Core Workflow API](./workflow.md)**: Detailed documentation for the fundamental building blocks:
  - `Node`: The base class for a unit of work.
  - `Flow`: The orchestrator for a graph of nodes.
  - `IExecutor` and `InMemoryExecutor`: The execution engine contract and its default implementation.
  - `Context`, `TypedContext`, `ContextKey`, and `contextKey()`: For type-safe state management.
  - `Logger` implementations: `ConsoleLogger` and `NullLogger`.
  - Error types: `WorkflowError` and `AbortError`.

## Builder API

This module contains classes that simplify the creation of common and complex workflow patterns.

- **[Builder API](./builder.md)**: Documentation for the builder classes:
  - `SequenceFlow`: For creating simple, linear workflows.
  - `ParallelFlow`: For creating concurrent workflows.
  - `BatchFlow`: For processing a collection of items sequentially.
  - `ParallelBatchFlow`: For processing a collection of items concurrently.
  - `GraphBuilder`: For constructing a `Flow` from a declarative graph, with type-safe dependency injection.

## Functional API

This module provides a set of functions for creating nodes and pipelines in a more functional programming style.

- **[Functional API](./fn.md)**: Documentation for the functional helpers:
  - `mapNode`: Creates a `Node` from a simple, pure function.
  - `contextNode`: Creates a `Node` from a function that requires `Context` access.
  - `pipeline`: A functional alias for creating a linear `SequenceFlow`.
  - `transformNode`: Creates a `Node` for declaratively updating the `Context` using lenses.
  - `lens` and `composeContext`: Utilities for functional context manipulation.

## Utilities API

This module contains standalone helper functions for common tasks like sanitizing graph data, generating visualizations, and composing middleware.

- **[Utilities API](./utils.md)**: Documentation for utility helpers:
  - `sanitizeGraph`: For cleaning graph data from UI tools.
  - `generateMermaidGraph`: For visualizing programmatically built flows.
  - `applyMiddleware`: For composing middleware chains (primarily for custom executors).
  - `sleep`: For creating cancellable delays.
