# Workflow

A flexible, lightweight, and zero-dependency workflow framework for any Javascript envirnoment. Build complex, multi-step processes, from simple sequences to dynamic, graph-driven AI agents.

## Features

- **Zero Dependencies**: Lightweight and dependency-free, ensuring a small footprint and easy integration.
- **Composable & Reusable**: Define workflows by chaining nodes. Entire flows can be nested and used as single nodes in other flows, promoting modularity.
- **Type-Safe**: Written in TypeScript to provide strong typing for your workflow definitions and context.
- **Async by Default**: Built on an asynchronous foundation to seamlessly handle I/O-bound and CPU-bound tasks.
- **Conditional Branching**: Direct the flow's execution path based on the results of any node.
- **Retry Logic & Fallbacks**: Automatically retry failed operations with configurable delays and define fallback logic.
- **Cancellation Support**: Gracefully abort running workflows using standard `AbortController`s.
- **Pluggable Logging**: Observe and debug workflows with a standard `Logger` interface. Use the built-in console logger or bring your own (e.g., Pino, Winston).
- **Dynamic Graph Engine**: Define complex, graph-based workflows as simple JSON files. The engine dynamically builds and executes them, supporting parallel fan-in/fan-out, conditional branching, and sub-workflows.

## Installation

```bash
npm install https://github.com/gorango/workflow
```

## Learn by Example

The best way to understand the framework is by exploring the included sandbox examples. They are ordered by increasing complexity, each introducing new features and demonstrating the flexibility of the core engine.

### 1. Basic Sequential Flow: Article Writer

A simple, linear workflow that demonstrates the core concepts of creating a sequence of nodes to perform a multi-step task like generating an article.

- **Demonstrates**: `Node` chaining, passing data via `Context`, and a simple `BatchFlow`.
- **[Explore the Basic example &raquo;](./sandbox/1.basic/)**

### 2. Conditional Branching: Research Agent

A simple agent that uses a loop and conditional branching to decide whether to search the web for information or answer a question based on the current context.

- **Demonstrates**: Conditional branching with custom actions, creating loops, and building simple state machines.
- **[Explore the Research Agent example &raquo;](./sandbox/2.research/)**

### 3. Parallel Batch Processing: Document Translator

A practical example that translates a document into multiple languages concurrently. It uses the `ParallelBatchFlow` builder to showcase significant performance boosts for I/O-bound tasks.

- **Demonstrates**: `ParallelBatchFlow` for high-throughput concurrent processing of I/O-bound tasks.
- **[Explore the Parallel Translation example &raquo;](./sandbox/3.parallel/)**

### 4. Dynamic Graph Engine: AI Agent Runtime

The most advanced example: a powerful runtime that executes complex, graph-based AI workflows defined in simple JSON files. This shows how to build highly dynamic and modular AI agent systems.

- **Demonstrates**:
  - Dynamic flow creation from file-based definitions using `GraphBuilder`.
  - Parallel fan-in and fan-out (mid-flow branching).
  - Reusable, data-driven nodes (e.g., an LLM-powered router).
  - Complex sub-workflow composition.
- **[Explore the Dynamic AI Agent example &raquo;](./sandbox/4.dag/)**

## Core Concepts

### Node

The `Node` is the fundamental building block of a workflow. It represents a single, potentially asynchronous unit of work with a three-phase lifecycle:

1. `prep(args)`: Prepare data for execution (e.g., fetch from `Context`).
2. `exec(args)`: Perform the core logic, isolated from the context.
3. `post(args)`: Process results, update the `Context`, and return an "action" string to determine the next step.

### Flow

A `Flow` is a special type of `Node` that orchestrates a sequence of other nodes. You define a starting node and chain subsequent nodes together, creating a graph of operations.

### The Builder Pattern (`workflow/builder`)

To simplify the creation of common and complex patterns, the framework provides a `builder` module. These builders construct executable `Flow` objects for you.

- **`BatchFlow` / `ParallelBatchFlow`**: Process a collection of items sequentially or concurrently.
- **`GraphBuilder`**: Translates a declarative graph definition (e.g., from a JSON file) into a fully executable `Flow`, intelligently handling parallelism.

### Context

The `Context` is a shared, type-safe `Map`-like object passed through every node in a flow. It acts as a shared memory space, allowing nodes to pass data and share state.

### Actions & Branching

A node's `post()` method returns a string called an **action**. The flow uses this action to look up the next node to execute. The default action is `'default'`, but returning custom strings allows for powerful conditional branching.

## Unit Tests

For clear, focused examples of specific, individual features (like retries, cancellation, and composition), the unit tests are an excellent resource.

- Core workflow tests: [`src/workflow.test.ts`](src/workflow.test.ts)
- Collection flows tests: [`src/builder/collection.test.ts`](src/builder/collection.test.ts)
- Graph builder tests: [`src/builder/graph.test.ts`](src/builder/graph.test.ts)

## API Reference

### Core Classes (`workflow`)

- `Node`: The base class for a unit of work with built-in retry logic.
- `Flow`: Orchestrates a sequence of nodes. Provides a `Flow.sequence(...)` helper for creating linear flows.
- `TypedContext`: The standard `Map`-based implementation for the `Context` interface.

### Builder Classes (`workflow/builder`)

- `SequenceFlow`: A `Flow` that creates a linear flow from a sequence of nodes.
- `BatchFlow`: A `Flow` that processes a collection of items sequentially.
- `ParallelBatchFlow`: A `Flow` that processes a collection of items in parallel.
- `GraphBuilder`: Constructs a `Flow` from a declarative graph definition.
