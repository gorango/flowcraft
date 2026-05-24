# tldraw demo

Demonstrates the two main modes of `@flowcraft/tldraw`:

- **Visualize & Run**: renders a `FlowBuilder` workflow as an interactive tldraw canvas with execution controls (Run, Restart, View State)
- **Editor**: bidirectional canvas editor that syncs shape changes back to a `WorkflowBlueprint`

## Getting started

```bash
pnpm install
pnpm dev
```

## Packages used

- [`@flowcraft/tldraw`](https://github.com/gorango/flowcraft/blob/master/packages/tldraw/) - tldraw-based workflow editor
- [`flowcraft`](https://github.com/gorango/flowcraft/blob/master/packages/core/) - workflow engine
- [`tldraw`](https://tldraw.dev) - infinite canvas
