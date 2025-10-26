# `flowcraft`

[![NPM Version](https://img.shields.io/npm/v/flowcraft.svg)](https://www.npmjs.com/package/flowcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Codecov](https://img.shields.io/codecov/c/github/gorango/flowcraft/master)](https://codecov.io/github/gorango/flowcraft)

Build complex, multi-step processes with a lightweight, composable, and type-safe approach. Model complex business processes, data pipelines, ETL workflows, or AI agents and scale from in-memory scripts to distributed systems without changing the core business logic.

## Key Features

-   **Zero Dependencies**: Lightweight and dependency-free, ensuring easy integration in any runtime.
-   **Declarative Workflows**: Define workflows as [serializable](https://flowcraft.js.org/guide/core-concepts#workflow-blueprint) objects with [nodes and edges](https://flowcraft.js.org/guide/core-concepts#nodes-edges).
-   **Unopinionated Logic**: Nodes can be simple [functions](https://flowcraft.js.org/guide/core-concepts#function-based-nodes) or structured [classes](https://flowcraft.js.org/guide/core-concepts#class-based-nodes), supporting any logic.
-   **Progressive Scalability**: Run [in-memory](https://flowcraft.js.org/guide/programmatic) or scale to [distributed systems](https://flowcraft.js.org/guide/distributed-execution) using the same blueprint.
-   **Resilient Execution**: Built-in support for [retries](https://flowcraft.js.org/guide/error-handling#retries), [fallbacks](https://flowcraft.js.org/guide/error-handling#fallbacks), [timeouts](https://flowcraft.js.org/guide/core-concepts#config), and [cancellation](https://flowcraft.js.org/guide/core-concepts#cancellation).
-   **Advanced Patterns**: Includes [batches](https://flowcraft.js.org/guide/batches), [loops](https://flowcraft.js.org/guide/loops), [subflows](https://flowcraft.js.org/guide/subflows), and [HITL](https://flowcraft.js.org/guide/hitl) constructs for complex workflows.
-   **Extensibility**: Pluggable [loggers](https://flowcraft.js.org/guide/loggers), [evaluators](https://flowcraft.js.org/guide/evaluators), [serializers](https://flowcraft.js.org/guide/serializers), and [middleware](https://flowcraft.js.org/guide/middleware) for custom behavior.
-   **Static Analysis**: Tools to [detect cycles](https://flowcraft.js.org/guide/static-analysis#detecting-cycles), [validate blueprints](https://flowcraft.js.org/guide/static-analysis#linting-a-blueprint), and [generate visual diagrams](https://flowcraft.js.org/guide/visualizing-workflows#generatemermaid).
-   **Type-Safe API**: [Fully typed](https://flowcraft.js.org/guide/core-concepts#context) with TypeScript for a robust developer experience.

## Installation

```bash
npm install flowcraft
```


## Usage

Define and run a simple workflow in a few lines of code.

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'

// 1. Define your functions for the nodes
async function startNode({ context }: NodeContext) {
	const output = await context.get('value')
	return { output }
}
async function doubleNode({ input }: NodeContext) {
	return { output: input * 2 }
}

// 2. Define the workflow structure
const flow = createFlow('simple-workflow')
	.node('start', startNode)
	.node('double', doubleNode)
	.edge('start', 'double')

// 3. Initialize the runtime
const runtime = new FlowRuntime()

// 4. Execute the workflow
async function run() {
	const result = await runtime.run(blueprint, { value: 42 })
	console.log(result.context) // { start: 42, double: 84 }
	console.log(result.status) // 'completed'
}

run()
```

## Core Concepts

-   **Blueprint**: A serializable object that represents the structure of your workflow. It contains all the nodes and edges and can be stored as JSON or YAML. This is the single source of truth for a workflow's logic.
-   **Node**: A single unit of work. Node logic can be implemented as a simple async function or a structured class that extends `BaseNode` for more complex lifecycle management.
-   **Edge**: A connection between two nodes that defines the direction of the flow. Edges can be conditional, allowing you to create branching logic based on the output or `action` of a source node.
-   **Runtime**: The `FlowRuntime` is the engine that interprets a blueprint and executes its nodes in the correct order. It manages state, handles resiliency, and coordinates the entire process.
-   **Context**: An object that holds the state of a single workflow execution. The outputs of completed nodes are stored in the context and can be accessed by subsequent nodes.

## Resiliency and Error Handling

Design robust workflows with built-in resiliency features.

-   **Retries**: Configure the `maxRetries` property on a node to automatically retry it on failure.
-   **Fallbacks**: Specify a `fallback` node ID in a node's configuration. If the node fails all its retry attempts, the fallback node will be executed instead, preventing the entire workflow from failing.

For more granular control, you can implement a node using the `BaseNode` class, which provides `prep`, `exec`, `post`, `fallback`, and `recover` lifecycle methods.

## Tooling and Utilities

Flowcraft includes tools to help you validate and visualize your workflows.

-   **Linter (`lintBlueprint`)**: Statically analyze a blueprint to find common errors, such as orphan nodes, invalid edges, or nodes with missing implementations.
-   **Analysis (`analyzeBlueprint`)**: Programmatically inspect a blueprint to detect cycles, find start/terminal nodes, and get other graph metrics.
-   **Diagram Generation (`generateMermaid`)**: Automatically generate a [Mermaid](https://mermaid-js.github.io/mermaid/#/) syntax string from a blueprint to easily visualize your workflow's structure.

## Extensibility and Customization

The `FlowRuntime` can be configured with pluggable components to tailor its behavior to your specific needs:

-   **Logger**: Provide a custom `ILogger` implementation (e.g., Pino, Winston) to integrate with your existing logging infrastructure.
-   **Serializer**: Replace the default `JsonSerializer` with a more robust one (e.g., `superjson`) to handle complex data types like `Date`, `Map`, and `Set` in the workflow context.
-   **Evaluator**: Swap the default `PropertyEvaluator` for a more powerful expression engine (like `jsep` or `govaluate`) to enable complex logic in edge conditions. For trusted environments, an `UnsafeEvaluator` is also available.
-   **Middleware**: Wrap node execution with custom logic for cross-cutting concerns like distributed tracing, performance monitoring, or advanced authorization.
-   **Event Bus**: An event emitter for monitoring workflow and node lifecycle events (`workflow:start`, `node:finish`, etc.).

## Distributed Execution

Flowcraft's architecture is designed for progressive scalability. The `BaseDistributedAdapter` provides a foundation for running workflows across multiple machines. Flowcraft provides official adapters for [BullMQ](https://www.npmjs.com/package/@flowcraft/bullmq-adapter), [AWS](https://www.npmjs.com/package/@flowcraft/sqs-adapter), [GCP](https://www.npmjs.com/package/@flowcraft/gcp-adapter), [Azure](https://www.npmjs.com/package/@flowcraft/azure-adapter), [RabbitMQ](https://www.npmjs.com/package/@flowcraft/rabbitmq-adapter), and [Kafka](https://www.npmjs.com/package/@flowcraft/kafka-adapter).

## Documentation

For a complete overview of features, patterns, examples, and APIs, see the full [documentation](https://flowcraft.js.org/).

## License

Flowcraft is licensed under the [MIT License](LICENSE).
