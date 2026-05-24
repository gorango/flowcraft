# Svelte Flow Demo

A Vite + Svelte 5 application that renders a flowcraft workflow as an interactive canvas using [@xyflow/svelte](https://svelteflow.dev) (Svelte Flow).

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
pnpm --filter svelte dev
```

Then open the URL shown by Vite (typically http://localhost:5173).

Press **Run** to execute the workflow. Because the total ($1,665) falls in the $500–$2,000 range, the flow pauses at the `wait-manager` HITL node — use **Approve** or **Deny** to resume it.

## Architecture

```
src/lib/
├── EventBus.ts              # IEventBus impl with typed .on() subscriptions
├── Flow.svelte              # Main component: runtime setup + SvelteFlow canvas
├── StatusIndicator.svelte   # Animated SVG ring (CSS keyframes)
├── Node/
│   ├── FlowNode.svelte      # Base node card (status + label + inputs/outputs)
│   ├── InputNode.svelte     # Single source handle
│   ├── DefaultNode.svelte   # Target + source handles
│   └── OutputNode.svelte    # Single target handle
└── Edge/
    └── LoopbackEdge.svelte  # Custom SVG arc edge for loop-back connections
```

### Connecting flowcraft to @xyflow/svelte

The key integration point is the `EventBus` class, which satisfies flowcraft's `IEventBus` interface while also exposing a typed `on()` method:

```ts
import type { IEventBus, FlowcraftEvent } from 'flowcraft'

class EventBus implements IEventBus {
	emit(event: FlowcraftEvent) {
		/* fan out to listeners */
	}
	on(type, handler): () => void {
		/* subscribe, returns unsubscribe */
	}
}
```

Inside `Flow.svelte`, the bus is passed to `FlowRuntime` and the component subscribes to events to update Svelte Flow node state via `$state.raw` reassignment:

```ts
const eventBus = new EventBus()
const runtime = new FlowRuntime({ eventBus, evaluator: new UnsafeEvaluator() })

eventBus.on('node:start', (e) => {
	nodes = nodes.map((n) =>
		n.id === e.payload.nodeId
			? {
					...n,
					data: { ...n.data, nodeData: { status: 'pending', inputs: e.payload.input } },
				}
			: n,
	)
})
eventBus.on('node:finish', (e) => {
	nodes = nodes.map((n) =>
		n.id === e.payload.nodeId
			? {
					...n,
					data: {
						...n.data,
						nodeData: { status: 'completed', outputs: e.payload.result.output },
					},
				}
			: n,
	)
})
```

Node data is stored inside each Svelte Flow node's `data.nodeData` object so updates flow through naturally without a separate state store. Svelte 5's `$state.raw` requires full array reassignment to trigger reactivity.

### HITL Resume

When the runtime returns `status: 'awaiting'`, the toolbar shows **Approve / Deny** buttons that call `runtime.resume()` with the appropriate payload:

```ts
const result = await runtime.run(blueprint, init, { functionRegistry })

if (result.status === 'awaiting') {
	awaitingNodes = (result.context as any)._awaitingNodeIds || []
	serializedContext = (result as any).serializedContext
	// Show resume buttons in the UI
	await runtime.resume(blueprint, serializedContext, { output: { approved: true } }, nodeId)
}
```

## What You'll Learn

- How to convert a `FlowBuilder` graph into Svelte Flow nodes and edges via `flow.toGraphRepresentation()`
- How to implement `IEventBus` to bridge flowcraft events into Svelte 5 reactive state (`$state.raw`)
- How to build custom Svelte Flow node types that display live execution data
- How to handle HITL (human-in-the-loop) pause/resume in a UI
- How to render loopback edges with custom SVG arc paths
