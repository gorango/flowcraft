# What is Cascade?

Cascade is a lightweight, zero-dependency TypeScript framework for building complex, multi-step processes. It empowers you to model everything from simple sequential tasks to dynamic, graph-driven AI agents with a clear and composable API.

This documentation will guide you through the core concepts, advanced features, and best practices for using the framework effectively.

## Where to Start

- **[Getting Started](./getting-started.md)**: A step-by-step tutorial that walks you through building and running your first workflow. This is the best place to begin.

- **[Core Concepts](./core-concepts.md)**: An in-depth look at the fundamental building blocks of Cascade:
  - `Node`: The basic unit of work and its fluent data-processing API.
  - `Flow`: The orchestrator for a graph of nodes.
  - `Context`: The shared memory of a workflow.
  - `Actions`: The mechanism for conditional branching.

- **[Builders](./builders.md)**: Learn about the helper classes that simplify the creation of common and complex workflow patterns, including sequential, parallel, and declarative graph-based flows.

- **[Functional API](./functional-api.md)**: Discover a more functional style of defining nodes and pipelines using helper functions.

## Guides

High-level guides to help you understand Cascade's architecture and features.

- **[Philosophy & Comparison](./philosophy-and-comparison.md)**: Understand the "why" behind Cascade and how it compares to other tools.
- **[Error Handling](./advanced-guides/error-handling.md)**: Implement robust workflows with automatic retries and custom fallback logic.
- **[Cancellation](./advanced-guides/cancellation.md)**: Gracefully abort in-progress workflows using standard `AbortController`s.
- **[Composition](./advanced-guides/composition.md)**: Build modular systems by nesting flows within other flows.
- **[Middleware](./advanced-guides/middleware.md)**: Intercept node execution to handle cross-cutting concerns like logging, timing, or authentication.
- **[Building a Custom Executor](./advanced-guides/custom-executor.md)**: Learn how to create custom execution engines for different environments.

## Best Practices

Practical advice for building robust, maintainable, and testable workflows.

- **[State Management](./best-practices/state-management.md)**: Learn the best ways to use the `Context`.
- **[Data Flow in Sub-Workflows](./best-practices/sub-workflow-data.md)**: Manage context boundaries when composing flows.
- **[Testing Workflows](./best-practices/testing.md)**: Strategies for unit and integration testing.
- **[Debugging Workflows](./best-practices/debugging.md)**: Techniques for finding and fixing issues in your flows.

## Tooling

Utilities to help you build, debug, and document your workflows.

- **[Visualizing Workflows](./tooling/mermaid.md)**: Automatically generate diagrams of your `Flow`s.

## Learn by Example

For practical, end-to-end examples, the best resource is the `sandbox/` directory in the main repository. Each example is a self-contained project demonstrating a key feature of Cascade, from basic sequences to a full-fledged dynamic AI agent runtime and a distributed executor.
