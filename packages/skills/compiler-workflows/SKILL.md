---
name: compiler-workflows
description: Write workflows using imperative TypeScript with the Flowcraft Compiler. Covers @flow and @step annotations, control flow patterns, subflows, configuration, and build tool integration. Use when the user mentions the compiler, imperative workflows, @flow, @step, or wants to write workflows without manually constructing graphs.
---

# Compiler Workflows (Alpha)

Flowcraft's compiler transforms imperative TypeScript into declarative blueprints at build time. Write familiar async functions with control flow — the compiler generates the graph.

> [!WARNING]
> The compiler is in alpha. Contributions are welcome.

## Quick start

### Installation

```bash
npm install --save-dev @flowcraft/compiler
```

### Write a workflow

```typescript
/** @flow */
export async function myWorkflow(input: string) {
	const data = await fetchData(input)
	const result = await processData(data)
	return result
}

/** @step */
async function fetchData(input: string) {
	// Implementation — this becomes a durable node
	return fetch(`/api/data?q=${input}`).then((r) => r.json())
}

/** @step */
async function processData(data: unknown) {
	// Implementation — this becomes a durable node
	return { processed: true, data }
}
```

### Execute

```typescript
import { FlowRuntime } from 'flowcraft'
import manifest from './generated/manifest'

const runtime = new FlowRuntime()
const result = await runtime.run(manifest['myWorkflow'], { input: 'hello' })
```

## The Golden Rules

1. **Mark orchestrators with `/** @flow \*/`\*\* — Functions that define workflow orchestration
2. **Mark durable operations with `/** @step \*/`\*\* — Async operations that should be retried/tracked
3. **Never await plain async functions** — The compiler errors if you await a non-`@step` function

## Supported Control Flow

| Pattern     | Syntax                         | Compiles to                    |
| ----------- | ------------------------------ | ------------------------------ |
| Sequential  | `await stepA(); await stepB()` | Linear nodes with edges        |
| Conditional | `if/else` with `@step` calls   | Conditional edges with actions |
| Loops       | `for/while` with `@step` calls | Loop controller node           |
| Fallbacks   | `try/catch` with `@step` calls | Fallback node routing          |
| Parallelism | `Promise.all([@step, @step])`  | Fan-out/fan-in with join       |
| Subflows    | `await otherFlow(input)`       | Subflow node                   |

## Configuration

Create `flowcraft.config.ts`:

```typescript
import { defineConfig } from '@flowcraft/compiler'

export default defineConfig({
	entryPoints: ['./src/workflows/**/*.ts'],
	manifestPath: './src/generated/manifest.ts',
	tsConfigPath: './tsconfig.json',
})
```

## Build Tool Integration

Compilation happens automatically with plugins:

```typescript
// vite.config.ts
import flowcraft from '@flowcraft/plugin-vite'

export default {
	plugins: [flowcraft()],
}
```

Available plugins: Vite, Next.js, Nuxt, Astro, esbuild, tsup.

## Unsupported Syntax

- `finally` blocks in try/catch
- Complex variable re-assignments within loops
- Dynamic function calls or `eval`
- Generator functions or async generators
- Class methods as steps (use standalone functions)

## Advanced topics

- **Authoring detailed patterns**: See [authoring-guide.md](authoring-guide.md)
- **Configuration options**: See [configuration.md](configuration.md)
