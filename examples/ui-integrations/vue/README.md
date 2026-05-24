# Vue Flow Demo

A Vite + Vue 3 application that renders a flowcraft workflow as an interactive canvas using [@vue-flow/core](https://vueflow.dev).

## Overview

This example builds an **Expense Report Processing Pipeline** that showcases flowcraft's advanced primitives:

| Primitive       | Where                                                              |
| --------------- | ------------------------------------------------------------------ |
| **Batch**       | `validate-items` — validate each receipt in parallel               |
| **Loop**        | `ocrRetry` — re-scan until OCR confidence ≥ 0.9 (max 3 attempts)   |
| **Conditional** | `route-by-total` — auto-approve / HITL / auto-reject by total      |
| **HITL**        | `wait-manager` — pause for a human approval decision               |
| **Converge**    | `send-notification` — join all branches with `joinStrategy: 'any'` |

## Running the Example

```bash
# From the repo root
pnpm install

# Start the dev server
pnpm --filter @example/vue dev
```

Then open the URL shown by Vite (typically http://localhost:5173).

Press **Run** to execute the workflow. Because the total ($1,665) falls in the $500–$2,000 range, the flow pauses at the `wait-manager` HITL node — use **Approve** or **Deny** to resume it.

## Architecture

```
src/components/
├── EventBus.ts          # IEventBus impl with typed .on() subscriptions
├── Flow.vue             # Main component: runtime setup + VueFlow canvas
├── Node/
│   ├── Node.vue         # Base node card (status + label + inputs/outputs)
│   ├── Input.vue        # Single source handle
│   ├── Default.vue      # Target + source handles
│   ├── Output.vue       # Single target handle
│   └── Status.vue       # Animated SVG ring (CSS-only, no external deps)
├── Edge/
│   └── Loopback.vue     # Custom SVG arc edge for loop-back connections
└── composables/
    └── handlePositions.ts  # Auto-detect handle positions from graph layout
```

### Connecting flowcraft to @vue-flow/core

The key integration point is the `EventBus` class, which satisfies flowcraft's `IEventBus` interface while also exposing a typed `on()` method:

```ts
import type { IEventBus, FlowcraftEvent } from 'flowcraft'

class InMemoryEventBus implements IEventBus {
	emit(event: FlowcraftEvent) {
		/* fan out to listeners */
	}
	on(type, handler): () => void {
		/* subscribe, returns unsubscribe */
	}
}
```

Inside `Flow.vue`, the bus is passed to `FlowRuntime` and the component subscribes to events to update Vue Flow node data reactively:

```ts
const eventBus = new InMemoryEventBus()
const runtime = new FlowRuntime({ eventBus, evaluator: new UnsafeEvaluator() })

eventBus.on('node:start', (e) => {
	const { nodeId, input } = e.payload as any
	nodeData.value.set(nodeId, { status: 'pending', inputs: input })
})
eventBus.on('node:finish', (e) => {
	const { nodeId, result } = e.payload as any
	nodeData.value.set(nodeId, { status: 'completed', outputs: result.output })
})
```

Node data is stored in a reactive `Map<string, NodeData>` ref and passed to custom node slot templates via `getNodeData()`.

### Handle Positions

Unlike the React version (which requires an explicit `handlesMap` prop), the Vue version uses a `useHandlePositions` composable that auto-detects handle directions from the graph layout by analyzing connected nodes' relative positions.

### HITL Resume

When the runtime returns `status: 'awaiting'`, the toolbar shows **Approve / Deny** buttons that call `runtime.resume()` with the appropriate payload:

```ts
const result = await runtime.run(blueprint, initalState, { functionRegistry })

if (result.status === 'awaiting') {
	awaitingNodes.value = result.context._awaitingNodeIds
	serializedContext.value = result.serializedContext
	// Show resume buttons in the UI
	await runtime.resume(blueprint, serializedContext.value, { output: { approved: true } }, nodeId)
}
```

## What You'll Learn

- How to convert a `FlowBuilder` graph into Vue Flow nodes and edges via `flow.toGraphRepresentation()`
- How to implement `IEventBus` to bridge flowcraft events into Vue reactive state
- How to build custom Vue Flow node types via slot templates that display live execution data
- How to handle HITL (human-in-the-loop) pause/resume in a UI
- How to render loopback edges with custom SVG arc paths
