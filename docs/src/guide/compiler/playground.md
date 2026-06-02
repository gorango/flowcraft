---
aside: false
---

# Compiler Playground

<script setup>
import Compiler from '../../.vitepress/theme/components/Demo/Compiler.vue'
</script>

Try out the Flowcraft Compiler directly in your browser. Write `@flow` / `@step` annotated TypeScript code and see the compiled workflow blueprint in real time.

<Compiler />

## How It Works

The playground runs the full `@flowcraft/compiler` pipeline entirely in your browser using TypeScript's compiler API compiled to WASM (via `esbuild-wasm`) with a virtual file system. No server-side processing is needed — your code never leaves your machine.

The compilation pipeline:

1. **Preprocessing**: Decorator-style `@flow` / `@step` annotations are normalized to JSDoc-style tags
2. **Parsing**: The TypeScript source is parsed into an AST using `ts.createProgram()` with a virtual in-memory file system
3. **Discovery**: Exported functions with `@flow` / `@step` annotations are discovered
4. **Analysis**: Each `@flow` function is analyzed by traversing its AST — control flow statements (`if`, `while`, `for...of`, `switch`, `try/catch`, `Promise.all`) are converted to graph nodes and edges
5. **Remapping**: Generic node types like `loop-controller` are remapped to workflow-compatible node types
6. **Output**: The resulting `WorkflowBlueprint` is returned as JSON and rendered as an interactive diagram

## Limitations

- **Single-file mode**: Only one source file at a time; cross-file step resolution is not supported in the playground
- **No type diagnostics**: The browser environment uses a minimal built-in type library, so type error diagnostics may differ from the Node.js version
- **`flowcraft/sdk` primitives**: Durable primitives like `sleep`, `waitForEvent`, and `createWebhook` are detected by name rather than import resolution
