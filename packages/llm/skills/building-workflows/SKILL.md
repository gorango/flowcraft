---
name: building-workflows
description: Build and execute workflows using Flowcraft's fluent API or declarative JSON blueprints. Covers nodes, edges, context, branching, error handling, and runtime execution. Use when creating workflows, defining workflow steps, connecting nodes, managing workflow state, or when the user mentions Flowcraft, workflows, blueprints, or flow building.
---

# Building Workflows

Flowcraft is a zero-dependency TypeScript workflow engine. Workflows are defined as serializable blueprints that run in-memory or scale to distributed systems via adapters.

## Authoring Styles

Flowcraft supports three ways to define workflows. Choose based on your needs:

| Style                | Best For                                      | Complexity | See                                                   |
| -------------------- | --------------------------------------------- | ---------- | ----------------------------------------------------- |
| **Fluent API**       | Most workflows, TypeScript users              | Low        | Below                                                 |
| **Declarative JSON** | Dynamic workflows, database-stored blueprints | Medium     | Below                                                 |
| **Compiler (Alpha)** | Developers who prefer imperative code         | Low        | [compiler-workflows/](../compiler-workflows/SKILL.md) |

## Quick start

### Fluent API (Recommended)

Define workflows programmatically with a chainable builder. Functions are auto-registered.

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'

const flow = createFlow<{ name: string; result: string }>('greet')
	.node('fetch', async ({ context }) => {
		const name = context.get('name')
		return { output: `Hello, ${name}!` }
	})
	.node('store', async ({ context, input }) => {
		context.set('result', input.output)
		return { output: input.output }
	})
	.edge('fetch', 'store')

const runtime = new FlowRuntime()
const result = await flow.run(runtime, { name: 'World' })
```

### Declarative JSON

Define workflows as plain JSON objects. Use when blueprints are generated dynamically, stored in a database, or authored by non-developers. You must provide the function registry separately.

```typescript
import { FlowRuntime } from 'flowcraft'

const blueprint = {
	id: 'greet',
	nodes: [
		{ id: 'fetch', uses: 'fetchFn' },
		{ id: 'store', uses: 'storeFn', inputs: 'fetch' },
	],
	edges: [{ source: 'fetch', target: 'store' }],
}

const runtime = new FlowRuntime({ registry: { fetchFn, storeFn } })
const result = await runtime.run(blueprint, { name: 'World' })
```

## Core primitives

### Nodes

Two styles:

**Function-based** — simple async functions:

```typescript
async function myNode({ context, input, params, signal }) {
	return { output: { data: 'value' } }
}
```

**Class-based** — structured lifecycle with selective retry:

```typescript
class MyNode extends BaseNode {
	async prep(ctx) {
		return { data: await fetchData() }
	}
	async exec(ctx, prepResult) {
		return { output: process(prepResult) }
	}
	async post(ctx, execResult) {
		return execResult
	}
	async fallback(ctx, error) {
		return { output: 'default' }
	}
	async recover(ctx, error) {
		/* cleanup */
	}
}
```

Node config options: `maxRetries`, `retryDelay`, `timeout`, `fallback` (node id), `joinStrategy` (`'all'` | `'any'`).

### Edges

Connect nodes and control flow:

```typescript
// Simple edge
.edge('a', 'b')

// Conditional edge (only follows if node returns matching action)
.edge('decision', 'success', { action: 'approved' })
.edge('decision', 'reject', { action: 'denied' })

// Edge with condition expression
.edge('a', 'b', { condition: 'input.value > 10' })

// Edge with transform
.edge('a', 'b', { transform: 'input.data.items' })
```

### Context

Shared workflow state with compile-time type safety:

```typescript
interface MyCtx {
  userId: string
  order: Order
  result?: ProcessResult
}

const flow = createFlow<MyCtx>('order-flow')
  .node('process', async ({ context }) => {
    const userId = context.get('userId')
    context.set('result', { status: 'ok' })
    return { output: { ... } }
  })
```

**Data flow:**

- `context.get(key)` / `context.set(key, value)` — shared state accessible by all nodes
- `input` — direct output from predecessor node via edge

## Patterns

- **Sequential pipeline**: Chain `.node()` + `.edge()` calls
- **Conditional branching**: Return `action` from node; edges filter on `{ action: 'value' }`
- **Error resilience**: Set `config: { maxRetries: 3, retryDelay: 2000, timeout: 5000 }`
- **Fan-out/fan-in**: Use `joinStrategy: 'all'` (default) or `'any'` (first-come-wins)

## Advanced features

- **Loops, batches, subflows**: See [advanced.md](advanced.md)
- **Common patterns** (branching, error handling, data flow): See [patterns.md](patterns.md)
- **Concrete examples**: See [examples.md](examples.md)

## Workflow statuses

| Status      | Meaning                                       |
| ----------- | --------------------------------------------- |
| `completed` | Finished successfully                         |
| `failed`    | Execution failed with errors                  |
| `stalled`   | Cannot proceed due to unresolved dependencies |
| `cancelled` | Stopped via AbortSignal                       |
| `awaiting`  | Paused at wait/sleep node                     |

## Runtime

```typescript
const runtime = new FlowRuntime({
	logger,
	eventBus,
	middleware,
	evaluator,
	serializer,
})

const result = await runtime.run(blueprint, initialState, options)
const resumed = await runtime.resume(blueprint, serializedContext, resumeData)
const replayed = await runtime.replay(blueprint, events)
```

### Execution control

Beyond `run`, `resume`, and `replay`, the runtime provides methods for fine-grained execution control:

```typescript
// Execute specific nodes within an existing execution
const result = await runtime.executeNodes(
	blueprint,
	executionId,
	['nodeA', 'nodeB'],
	events,
	options,
)

// Modify context mid-execution by reconstructing state and applying patches
const patched = await runtime.patchContext(blueprint, executionId, events, [
	{ key: 'userEmail', value: 'new@example.com', op: 'set' },
	{ key: 'tempData', value: undefined, op: 'delete' },
])

// Mark a node as completed with synthetic output (no node:start emitted)
const skipped = await runtime.markNodeCompleted(blueprint, executionId, 'optionalStep', {
	skipped: true,
})

// Request pause at next safe checkpoint (orchestrator checks between iterations)
runtime.requestPause(executionId)

// Rollback context to before a target node (soft rollback — cannot undo side effects)
const rolledBack = await runtime.rollbackExecution(blueprint, executionId, events, 'targetNode')

// Replay from a specific node with optional input overrides
const replayed = await runtime.replayFrom(blueprint, events, 'processNode', {
	inputOverrides: { correctedData: '...' },
	functionRegistry: flow.getFunctionRegistry(),
})
```
