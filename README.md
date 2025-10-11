# Flowcraft

[![npm version](https://img.shields.io/npm/v/flowcraft.svg)](https://www.npmjs.com/package/flowcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Flowcraft** is a lightweight, unopinionated, and progressively scalable runtime for executing declarative workflows defined as directed acyclic graphs (DAGs). It is designed to reliably orchestrate complex business processes, data pipelines, ETL workflows, or AI agent orchestrations with a focus on simplicity, portability, and extensibility.

Unlike heavy platforms like Temporal or Airflow, or domain-specific libraries like LangChain, Flowcraft is a foundational engine that does one thing exceptionally well: **execute a graph of functions defined as data**. It provides a flexible, type-safe API to define workflows, execute them with resilience, and scale from in-memory scripts to distributed systems without changing the core business logic.

## Key Features

- **Declarative Workflows**: Define workflows as serializable `WorkflowBlueprint` objects with nodes (tasks) and edges (dependencies).
- **Unopinionated Logic**: Nodes can be simple functions or structured classes, supporting any logic (e.g., LLM calls, database queries, or data transformations).
- **Progressive Scalability**: Run workflows in-memory for testing or scale to distributed systems using the same blueprint.
- **Resilient Execution**: Built-in support for retries, fallbacks, timeouts, and graceful cancellation.
- **Advanced Patterns**: Includes batch processing (scatter-gather) and loop constructs for complex workflows.
- **Extensibility**: Pluggable loggers, evaluators, serializers, and middleware for custom behavior.
- **Static Analysis**: Tools to detect cycles, validate blueprints, and generate Mermaid diagrams for visualization.
- **Type-Safe API**: Fully typed with TypeScript for a robust developer experience.

For complete guides and API references: [Read the Friendly Manual](https://gorango.github.io/flowcraft/guide/).

## Installation

Flowcraft is a Node.js module using ES Modules (ESM) and TypeScript. Install it using your preferred package manager:

```bash
npm install flowcraft
```

## Getting Started

### Defining a Workflow

Use the `createFlow` API to define a workflow programmatically:

```typescript
import { ConsoleLogger, createFlow, FlowRuntime } from "flowcraft";

const flow = createFlow("simple-workflow")
  .node("start", async () => ({ output: 42 }))
  .node("double", async ({ input }) => ({ output: input * 2 }), {
    inputs: "start",
  })
  .edge("start", "double")
  .toBlueprint();

const runtime = new FlowRuntime({
  logger: new ConsoleLogger(),
  registry: flow.getFunctionRegistry(),
});

async function run() {
  const result = await runtime.run(flow, {});
  console.log(result);
  // Output: { context: { start: 42, double: 84 }, serializedContext: '{"start":42,"double":84}', status: 'completed' }
}

run();
```

### Analyzing a Workflow

Validate and visualize your workflow before execution:

```typescript
import { analyzeBlueprint, generateMermaid } from "flowcraft";

const analysis = analyzeBlueprint(flow);
console.log(analysis);
// Output: { cycles: [], startNodeIds: ['start'], terminalNodeIds: ['double'], nodeCount: 2, edgeCount: 1, isDag: true }

const mermaid = generateMermaid(flow);
console.log(mermaid);
// Output:
// flowchart TD
//     start["start"]
//     double["double"]
//     start --> double
```

### Linting a Workflow

Check for common errors in your blueprint:

```typescript
import { lintBlueprint } from "flowcraft";

const result = lintBlueprint(flow, flow.getFunctionRegistry());
console.log(result);
// Output: { isValid: true, issues: [] }
```

## Core Concepts

### Workflow Blueprint

A `WorkflowBlueprint` is a JSON-serializable object defining the workflow:

```typescript
interface WorkflowBlueprint {
  id: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  metadata?: Record<string, any>;
}
```

- **Nodes**: Represent tasks with an `id`, `uses` (implementation key), `inputs`, `params`, and `config` (e.g., retries, fallbacks).
- **Edges**: Define dependencies with optional `action`, `condition`, or `transform` for data flow.

### Nodes

Nodes encapsulate logic and can be:

- **Function-based**: Simple `async` functions returning a `NodeResult`.
- **Class-based**: Extend `BaseNode` for a structured lifecycle (`prep`, `exec`, `post`, `fallback`).

Example class-based node:

```typescript
import { BaseNode } from "flowcraft";

class MyNode extends BaseNode {
  async exec(
    prepResult: any,
    context: NodeContext,
  ): Promise<Omit<NodeResult, "error">> {
    return { output: prepResult * 2 };
  }
}
```

### Context

The `Context` manages workflow state, offering both synchronous (`ISyncContext`) and asynchronous (`IAsyncContext`) interfaces. Nodes always interact with an async view for consistency.

### Runtime

The `FlowRuntime` orchestrates execution, supporting:

- **In-memory execution**: Run entire workflows locally.
- **Distributed execution**: Execute single nodes as workers in a distributed system (requires external queue integration).
- **Extensibility**: Inject custom loggers, evaluators, serializers, and middleware.

### Advanced Patterns

- **Batch Processing**: Process arrays in parallel using `.batch()`:
    ```typescript
    flow.batch("process", async ({ input }) => ({ output: input * 2 }), {
      inputKey: "start",
      outputKey: "results",
    });
    ```
- **Loops**: Create iterative workflows with `.loop()`:
    ```typescript
    flow.loop("my-loop", {
      startNodeId: "start",
      endNodeId: "end",
      condition: "context.count < 5",
    });
    ```

## Extensibility

Customize Flowcraft with pluggable components:

- **Logger**: Implement `ILogger` (e.g., `ConsoleLogger`, `NullLogger`).
- **Evaluator**: Replace `SimpleEvaluator` with a secure library like `jsep` for edge conditions and transforms.
- **Serializer**: Use `superjson` instead of `JsonSerializer` for complex data types.
- **Middleware**: Add cross-cutting concerns like transactions or tracing:
    ```typescript
    const transactionMiddleware: Middleware = {
      aroundNode: async (ctx, nodeId, next) => {
        await db.query("BEGIN");
        try {
          const result = await next();
          await db.query("COMMIT");
          return result;
        } catch (e) {
          await db.query("ROLLBACK");
          throw e;
        }
      },
    };
    ```

## Documentation

Dive into the documentation to for guides and more advanced features like middleware, dependency injection, high-level patterns, and static analysis.

[Read the docs](https://gorango.github.io/flowcraft/guide/)

## License

Flowcraft is licensed under the [MIT License](LICENSE).
