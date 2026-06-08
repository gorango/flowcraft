# @flowcraft/tldraw

Visual workflow editor and execution viewer for [flowcraft](https://flowcraft.dev), built on [tldraw](https://tldraw.dev).

## Installation

```bash
pnpm add @flowcraft/tldraw
```

Requires `flowcraft`, `tldraw`, `react`, and `react-dom` as peer dependencies.

## Usage

### Visualization mode — render + run a workflow

```tsx
import { createFlow } from 'flowcraft'
import { FlowcraftCanvas } from '@flowcraft/tldraw'

const flow = createFlow('my-workflow')
	.node('fetch-data', async () => ({ output: [1, 2, 3] }))
	.node('process', async ({ input }) => ({ output: (input as number[]).map((n) => n * 2) }))
	.edge('fetch-data', 'process')

export default function Page() {
	return (
		<FlowcraftCanvas
			flow={flow}
			positions={{ 'fetch-data': { x: 0, y: 150 }, process: { x: 350, y: 150 } }}
		/>
	)
}
```

Nodes render as tldraw shapes with status-colored borders (idle/pending/completed/failed). A floating toolbar provides Run, Restart, and View State controls. Arrow edges between nodes reflect the blueprint's edge definitions.

### Editor mode — bidirectional canvas editing

```tsx
import { useState } from 'react'
import type { WorkflowBlueprint } from 'flowcraft'
import { FlowcraftEditor } from '@flowcraft/tldraw'

export default function EditorPage() {
	const [blueprint, setBlueprint] = useState<WorkflowBlueprint>()

	return <FlowcraftEditor blueprint={blueprint} onBlueprintChange={(bp) => setBlueprint(bp)} />
}
```

Every canvas change (drag, connect, edit) fires `onBlueprintChange` with the reconstructed `WorkflowBlueprint`. Use the `NodeConfigPanel` and `EdgeConfigPanel` to edit node definitions and edge metadata.

## Architecture

```
User code                       @flowcraft/tldraw                    flowcraft
┌─────────────────┐          ┌─────────────────────────┐          ┌───────────────┐
│ FlowcraftCanvas │ ──blueprint──►  blueprintToCanvas  │          │  FlowRuntime  │
│ FlowcraftEditor │ ◄──changes───  canvasToBlueprint   │──IEventBus──►  EventBus  │
└─────────────────┘          │  FlowcraftSync          │          │  Evaluator    │
                             │  ExecutionBridge        │◄───────────────┘         │
                             │  FlowcraftNodeUtil      │          └───────────────┘
                             │  (custom ShapeUtil)     │
                             └─────────────────────────┘
```

Two distinct sync paths:

- **canvas → blueprint** — `store.listen()` detects user edits; `canvasToBlueprint()` reads shapes + arrow bindings + edge meta, returns a `WorkflowBlueprint`
- **blueprint → canvas** — `blueprintToCanvas()` creates `flowcraft-node` shapes, arrow shapes, and bindings; deletes stale shapes

## API

### Components

| Component         | Props                                            | Description                                                   |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `FlowcraftCanvas` | `flow`, `positions`, `init?`, `className?`       | Renders a workflow as a tldraw canvas with execution controls |
| `FlowcraftEditor` | `blueprint?`, `onBlueprintChange?`, `className?` | Bidirectional canvas editor with sync                         |

### Hooks

| Hook                                   | Description                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| `useExecutionBridge(editor, eventBus)` | Subscribes to runtime events and mirrors status into shape props |

### Utilities

| Export                                        | Description                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `blueprintToCanvas(editor, blueprint, opts?)` | Populates a tldraw canvas from a blueprint                                                   |
| `canvasToBlueprint(editor)`                   | Reads the canvas and returns a `WorkflowBlueprint`                                           |
| `FlowcraftSync`                               | Orchestrator class with `applyBlueprint`, `readBlueprint`, `startListening`, `stopListening` |
| `EventBus`                                    | Typed pub/sub implementing `IEventBus`                                                       |
| `FlowcraftNodeUtil`                           | Custom `ShapeUtil` for `flowcraft-node` shapes                                               |

### Panels

| Component         | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `NodeConfigPanel` | Edit selected node's `id`, `uses`, `params`, `inputs`    |
| `EdgeConfigPanel` | Edit selected arrow's `action`, `condition`, `transform` |
