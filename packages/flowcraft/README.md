# Flowcraft

[![NPM Version](https://img.shields.io/npm/v/flowcraft.svg)](https://www.npmjs.com/package/flowcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Codecov](https://img.shields.io/codecov/c/github/gorango/flowcraft/master)](https://codecov.io/github/gorango/flowcraft)

Build complex, multi-step processes with a lightweight, composable, and type-safe approach. Model complex business processes, data pipelines, ETL workflows, or AI agents and scale from in-memory scripts to distributed systems without changing the core business logic.

## Key Features

- **Zero Dependencies**: Lightweight and dependency-free, ensuring a small footprint and easy integration.
- **Declarative Workflows**: Define workflows as serializable objects with nodes and edges.
- **Unopinionated Logic**: Nodes can be simple functions or structured classes, supporting any logic.
- **Progressive Scalability**: Run in-memory or scale to distributed systems using the same blueprint.
- **Resilient Execution**: Built-in support for retries, fallbacks, timeouts, and graceful cancellation.
- **Advanced Patterns**: Includes batch processing and loop constructs for complex workflows.
- **Extensibility**: Pluggable loggers, evaluators, serializers, and middleware for custom behavior.
- **Static Analysis**: Tools to detect cycles, validate blueprints, and generate visual diagrams.
- **Type-Safe API**: Fully typed with TypeScript for a robust developer experience.

## Installation

```bash
npm install flowcraft
```

## Usage

```typescript
import { createFlow, FlowRuntime } from './index'

const flow = createFlow('simple-workflow')
	.node('start', async () => ({ output: 42 }))
	.node('double', async ({ input }) => ({ output: input * 2 }), { inputs: 'start' })
	.edge('start', 'double')
	.toBlueprint()

const runtime = new FlowRuntime({
	registry: flow.getFunctionRegistry(),
})

async function run() {
	const result = await runtime.run(flow, {})
	console.log(result) // { context: { start: 42, double: 84 }, status: 'completed' }
}

run()
```

## Documentation

For a complete overview all features, patterns, examples, and APIs, please see the **[Flowcraft documentation](https://flowcraft.js.org/)**.

## License

Flowcraft is licensed under the [MIT License](LICENSE).
