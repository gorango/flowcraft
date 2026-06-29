# `flowcraft`

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/flowcraft.svg)](https://www.npmjs.com/package/flowcraft)
[![Codecov](https://img.shields.io/codecov/c/github/gorango/flowcraft/master?flag=core)](https://codecov.io/github/gorango/flowcraft/tree/master/packages/core/src?flags[0]=core)

Build complex, multi-step processes with a lightweight, composable, and type-safe approach. Model complex business processes, data pipelines, ETL workflows, or AI agents and scale from in-memory scripts to distributed systems without changing the core business logic.

## Key Features

- **Zero Dependencies**: Lightweight and dependency-free, ensuring easy integration in any runtime.
- **Declarative Workflows**: Define workflows as [serializable](https://flowcraft.js.org/guide/core-concepts#workflow-blueprint) objects with [nodes and edges](https://flowcraft.js.org/guide/core-concepts#nodes-edges).
- **Unopinionated Logic**: Nodes can be simple [functions](https://flowcraft.js.org/guide/core-concepts#function-based-nodes) or structured [classes](https://flowcraft.js.org/guide/core-concepts#class-based-nodes), supporting any logic.
- **Progressive Scalability**: Run [in-memory](https://flowcraft.js.org/guide/fluent) or scale to [distributed systems](https://flowcraft.js.org/guide/distributed-execution) using the same blueprint.
- **Resilient Execution**: Built-in support for [retries](https://flowcraft.js.org/guide/error-handling#retries), [fallbacks](https://flowcraft.js.org/guide/error-handling#fallbacks), [timeouts](https://flowcraft.js.org/guide/core-concepts#config), and [cancellation](https://flowcraft.js.org/guide/core-concepts#cancellation).
- **Advanced Patterns**: Includes [batches](https://flowcraft.js.org/guide/batches), [loops](https://flowcraft.js.org/guide/loops), [subflows](https://flowcraft.js.org/guide/subflows), and [HITL](https://flowcraft.js.org/guide/hitl) constructs for complex workflows.
- **Extensibility**: Pluggable [loggers](https://flowcraft.js.org/guide/loggers), [evaluators](https://flowcraft.js.org/guide/evaluators), [serializers](https://flowcraft.js.org/guide/serializers), and [middleware](https://flowcraft.js.org/guide/middleware) for custom behavior.
- **Static Analysis**: Tools to [detect cycles](https://flowcraft.js.org/guide/static-analysis#detecting-cycles), [validate blueprints](https://flowcraft.js.org/guide/static-analysis#linting-a-blueprint), and [generate visual diagrams](https://flowcraft.js.org/guide/visualizing-workflows#generatemermaid).
- **Type-Safe API**: [Fully typed](https://flowcraft.js.org/guide/core-concepts#context) with TypeScript for a robust developer experience.

## Installation

```bash
npm install flowcraft
```

## Usage

There are three ways to compose workflows in Flowcraft:

<details>
<summary><b>Fluent API</b> — Build workflows programmatically with the <code>createFlow</code> builder.</summary>

```typescript
import { createFlow, FlowRuntime, type NodeContext } from 'flowcraft'

// 1. Define your functions for the nodes
async function startNode({ context }: NodeContext) {
	const output = await context.get('value')
	return { output }
}
async function doubleNode({ input, context }: NodeContext) {
	const output = input * 2
	context.set('double', output)
	return { output }
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
	const result = await flow.run(runtime, { value: 42 })
	console.log(result.context) // { start: 42, double: 84 }
	console.log(result.status) // 'completed'
}

run()
```

See the [Fluent API Guide](https://flowcraft.js.org/guide/fluent) for more details.

</details>

<details>
<summary><b>Declarative</b> — Separate workflow structure (JSON) from node implementations (registry).</summary>

```typescript
import { FlowRuntime } from 'flowcraft'

// 1. Define reusable node functions in a registry
const nodeRegistry = {
	startNode: async ({ context }) => {
		const value = await context.get('value')
		return { output: value }
	},
	doubleNode: async ({ input }) => {
		return { output: input * 2 }
	},
}

// 2. Define the workflow structure as a JSON blueprint
const blueprint = {
	id: 'simple-workflow',
	nodes: [
		{ id: 'start', uses: 'startNode' },
		{ id: 'double', uses: 'doubleNode', inputs: 'start' },
	],
	edges: [{ source: 'start', target: 'double' }],
}

// 3. Run the blueprint with the registry
const runtime = new FlowRuntime({ registry: nodeRegistry })
const result = await runtime.run(blueprint, { value: 42 }, { functionRegistry: nodeRegistry })
```

See the [Declarative Workflows Guide](https://flowcraft.js.org/guide/declarative) for more details.

</details>

<details>
<summary><b>Compiler</b> — Use <code>@flow</code> / <code>@step</code> annotations to compile imperative code into a blueprint.</summary>

```typescript
/** @step */
export async function startNode(params: { value: number }) {
	return { output: params.value }
}

/** @step */
export async function doubleNode(params: { value: number }) {
	return { output: params.value * 2 }
}

/** @flow */
export async function simpleWorkflow() {
	const start = await startNode({ value: 42 })
	const result = await doubleNode({ value: start.output })
	return result
}
```

The compiler generates the blueprint and registry at build time. See the [Compiler API](https://flowcraft.js.org/api/compiler) for more details.

</details>

## Resiliency and Error Handling

Design robust workflows with built-in resiliency features.

- **Retries**: Configure the `maxRetries` property on a node to automatically retry it on failure.
- **Fallbacks**: Specify a `fallback` node ID in a node's configuration. If the node fails all its retry attempts, the fallback node will be executed instead, preventing the entire workflow from failing.

For more granular control, you can implement a node using the `BaseNode` class, which provides `prep`, `exec`, `post`, `fallback`, and `recover` lifecycle methods.

## Tooling and Utilities

Flowcraft includes tools to help you validate, visualize, and integrate workflows with LLMs.

- **Linter (`lintBlueprint`)**: Statically analyze a blueprint to find common errors, such as orphan nodes, invalid edges, or nodes with missing implementations.
- **Analysis (`analyzeBlueprint`)**: Programmatically inspect a blueprint to detect cycles, find start/terminal nodes, and get other graph metrics.
- **Diagram Generation (`generateMermaid`)**: Automatically generate a [Mermaid](https://mermaid-js.github.io/mermaid/#/) syntax string from a blueprint to easily visualize your workflow's structure.
- **Agent Tools**: Use [`@flowcraft/tools`](http://npmjs.com/package/@flowcraft/tools) to give LLMs Zod-based tools for composing, running, and monitoring workflows.

## Extensibility and Customization

The `FlowRuntime` can be configured with pluggable components to tailor its behavior to your specific needs:

- **Logger**: Provide a custom `ILogger` implementation (e.g., Pino, Winston) to integrate with your existing logging infrastructure.
- **Serializer**: Replace the default `JsonSerializer` with a more robust one (e.g., `superjson`) to handle complex data types like `Date`, `Map`, and `Set` in the workflow context.
- **Evaluator**: Swap the default `PropertyEvaluator` for a more powerful expression engine (like `jsep` or `govaluate`) to enable complex logic in edge conditions. For trusted environments, an `UnsafeEvaluator` is also available.
- **Middleware**: Wrap node execution with custom logic for cross-cutting concerns like distributed tracing, performance monitoring, or advanced authorization.
- **Event Bus**: An event emitter for monitoring workflow and node lifecycle events (`workflow:start`, `node:finish`, etc.).

## Distributed Execution

Flowcraft's architecture is designed for progressive scalability. The `BaseDistributedAdapter` provides a foundation for running workflows across multiple machines. Flowcraft provides official adapters for [BullMQ](https://www.npmjs.com/package/@flowcraft/bullmq-adapter), [AWS](https://www.npmjs.com/package/@flowcraft/sqs-adapter), [GCP](https://www.npmjs.com/package/@flowcraft/gcp-adapter), [Azure](https://www.npmjs.com/package/@flowcraft/azure-adapter), [RabbitMQ](https://www.npmjs.com/package/@flowcraft/rabbitmq-adapter), [Kafka](https://www.npmjs.com/package/@flowcraft/kafka-adapter), [Vercel](https://www.npmjs.com/package/@flowcraft/vercel-adapter), and [Cloudflare](https://www.npmjs.com/package/@flowcraft/cloudflare-adapter).

## Documentation

For a complete overview of features, patterns, examples, and APIs, see the full [documentation](https://flowcraft.js.org/).

## License

Flowcraft is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
