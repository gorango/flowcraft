# @flowcraft/tldraw — example app

Demonstrates the two main modes of `@flowcraft/tldraw`:

- **Visualize & Run** — renders a `FlowBuilder` workflow as an interactive tldraw canvas with execution controls (Run, Restart, View State)
- **Editor** — bidirectional canvas editor that syncs shape changes back to a `WorkflowBlueprint`

## Getting started

```bash
pnpm install
pnpm dev
```

## Packages used

- [`@flowcraft/tldraw`](../../packages/tldraw/) — tldraw-based workflow editor
- [`flowcraft`](../../packages/core/) — workflow engine
- [`tldraw`](https://tldraw.dev) — infinite canvas
