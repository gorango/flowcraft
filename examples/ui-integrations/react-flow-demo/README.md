# React Flow Demo

A Next.js application that renders a flowcraft workflow as an interactive canvas using [@xyflow/react](https://reactflow.dev).

## Overview

This example builds an **Expense Report Processing Pipeline** that showcases flowcraft's advanced primitives:

| Primitive | Where |
|---|---|
| **Batch** | `validate-items` — validate each receipt in parallel |
| **Loop** | `ocrRetry` — re-scan until OCR confidence ≥ 0.9 (max 3 attempts) |
| **Conditional** | `route-by-total` — auto-approve / HITL / auto-reject by total |
| **HITL** | `wait-manager` — pause for a human approval decision |
| **Converge** | `send-notification` — join all branches with `joinStrategy: 'any'` |

## Running the Example

```bash
# From the repo root
pnpm install

# Start the dev server
pnpm --filter @example/react-flow-demo dev
```

Then open [http://localhost:3000](http://localhost:3000).

Press **Run** to execute the workflow. Because the total ($1,665) falls in the $500–$2,000 range, the flow pauses at the `wait-manager` HITL node — use **Approve** or **Deny** to resume it.

## Architecture

```
components/flow/
├── EventBus.ts        # IEventBus impl with typed .on() subscriptions
├── FlowDemo.tsx       # Main component: runtime setup + ReactFlow canvas
├── FlowNode.tsx       # Base node card (status + label + inputs/outputs)
├── nodes.tsx          # InputNode / DefaultNode / OutputNode with Handles
├── LoopbackEdge.tsx   # Custom SVG arc edge for loop-back connections
└── StatusIndicator.tsx # Animated SVG ring (idle / pending / completed / failed)
```

### Connecting flowcraft to @xyflow/react

The key integration point is the `EventBus` class, which satisfies flowcraft's `IEventBus` interface while also exposing a typed `on()` method:

```ts
import type { IEventBus, FlowcraftEvent } from 'flowcraft'

class EventBus implements IEventBus {
  emit(event: FlowcraftEvent) { /* fan out to listeners */ }
  on(type, handler): () => void { /* subscribe, returns unsubscribe */ }
}
```

Inside `FlowDemo`, the bus is passed to `FlowRuntime` and the component subscribes to events to update React Flow node state:

```ts
const eventBus = new EventBus()
const runtime = new FlowRuntime({ eventBus, evaluator: new UnsafeEvaluator() })

// Mirror runtime events → React Flow node data
bus.on('node:start',  (e) => updateNodeData(e.payload.nodeId, { status: 'pending', inputs: e.payload.input }))
bus.on('node:finish', (e) => updateNodeData(e.payload.nodeId, { status: 'completed', outputs: e.payload.result.output }))
bus.on('batch:start', (e) => updateNodeData(e.payload.batchId, { status: 'pending' }))
bus.on('batch:finish',(e) => updateNodeData(e.payload.batchId, { status: 'completed', outputs: e.payload.results }))
```

Node data is stored inside each React Flow node's `data` object so updates flow through naturally without a separate state store.

### HITL Resume

When the runtime returns `status: 'awaiting'`, the toolbar shows **Approve / Deny** buttons that call `runtime.resume()` with the appropriate payload:

```ts
const result = await runtime.run(blueprint, init, { functionRegistry })

if (result.status === 'awaiting') {
  // Show resume buttons in the UI
  // On button click:
  await runtime.resume(blueprint, result.serializedContext, { output: { approved: true } }, nodeId)
}
```

## What You'll Learn

- How to convert a `FlowBuilder` graph into React Flow nodes and edges via `flow.toGraphRepresentation()`
- How to implement `IEventBus` to bridge flowcraft events into React state
- How to build custom React Flow node types that display live execution data
- How to handle HITL (human-in-the-loop) pause/resume in a UI
- How to render loopback edges with custom SVG arc paths
