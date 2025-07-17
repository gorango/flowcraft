# API Reference

This section provides a detailed breakdown of the core classes, functions, and types available in the Cascade framework. It is intended as a reference for when you need to understand the specific capabilities of a particular component.

All components are imported from the main `cascade` package.

## Core API

This is the main entry point for the most essential components of the framework.

- **[Workflow API](./workflow.md)**: Detailed documentation for the fundamental building blocks:
  - `Node`: The base class for a unit of work.
  - `Flow`: The orchestrator for a graph of nodes.
  - `InMemoryExecutor`: The default in-memory execution engine.
  - `TypedContext`: The standard implementation of the `Context`.
  - `ContextKey` and `contextKey()`: For type-safe context access.
  - `Logger` implementations: `ConsoleLogger` and `NullLogger`.
  - Error types: `WorkflowError` and `AbortError`.

## Functional API

This module provides a set of functions for creating nodes and pipelines in a more functional style.

- **[Functional API](./fn.md)**: Documentation for the functional helpers:
  - `mapNode`: Creates a `Node` from a simple, pure function.
  - `contextNode`: Creates a `Node` from a function that requires `Context` access.
  - `pipeline`: A functional alias for creating a linear `SequenceFlow`.
  - `transformNode`: Creates a `Node` for declaratively updating the `Context`.

## Builder API

This module contains classes that simplify the creation of common and complex workflow patterns.

- **[Builder API](./builder.md)**: Documentation for the builder classes:
  - `SequenceFlow`: For creating simple, linear workflows.
  - `BatchFlow`: For processing a collection of items sequentially.
  - `ParallelBatchFlow`: For processing a collection of items concurrently.
  - `GraphBuilder`: For constructing a `Flow` from a declarative graph definition.
