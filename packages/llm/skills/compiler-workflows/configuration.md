# Compiler Configuration

How to install and configure the Flowcraft Compiler.

## Installation

```bash
npm install --save-dev @flowcraft/compiler
```

## flowcraft.config.ts

Create a `flowcraft.config.ts` file in your project root:

```typescript
import { defineConfig } from '@flowcraft/compiler'

export default defineConfig({
	// Entry points for your workflow files
	entryPoints: ['./src/workflows/**/*.ts'],

	// Path to the generated manifest file
	manifestPath: './src/generated/manifest.ts',

	// Path to your tsconfig.json (optional, defaults to './tsconfig.json')
	tsConfigPath: './tsconfig.json',
})
```

### Configuration Options

| Option         | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `entryPoints`  | Glob patterns matching workflow files with `@flow` functions      |
| `manifestPath` | Where the compiler writes the generated manifest                  |
| `tsConfigPath` | Path to TypeScript config for type checking and module resolution |

## Programmatic Usage

Run the compiler in build scripts:

```typescript
import { compileProject } from '@flowcraft/compiler'

const result = await compileProject({
	entryPoints: ['./src/workflows/**/*.ts'],
	tsConfigPath: './tsconfig.json',
})

if (result.diagnostics.length > 0) {
	console.error('Compilation errors:', result.diagnostics)
	process.exit(1)
}

// Write the manifest
await fs.writeFile('./src/generated/manifest.ts', result.manifestSource)

// Also available:
// result.blueprints — Array of compiled blueprint objects
// result.registry — Registry of all discovered flows and steps
```

Or use `buildFlows()` for config loading and file writing:

```typescript
import { buildFlows } from '@flowcraft/compiler'

// Loads flowcraft.config.ts and compiles all workflows
await buildFlows()
```

## Executing Compiled Workflows

### Via manifest

```typescript
import { FlowRuntime } from 'flowcraft'
import manifest from './src/generated/manifest'

const runtime = new FlowRuntime()
const result = await runtime.run(manifest['myWorkflow'], { inputParam: 'value' })
```

### Direct blueprint access

```typescript
import { compileProject } from '@flowcraft/compiler'
import { FlowRuntime } from 'flowcraft'

const compilationResult = await compileProject({
	entryPoints: ['./src/workflows/**/*.ts'],
})

const blueprint = compilationResult.blueprints.find((b) => b.id === 'myWorkflow')
const runtime = new FlowRuntime()
const result = await runtime.run(blueprint, initialData)
```

### With build tool plugins

When using plugins (Vite, Next.js, etc.), compilation happens automatically:

```typescript
// vite.config.ts
import flowcraft from '@flowcraft/plugin-vite'

export default {
	plugins: [flowcraft()],
}

// Workflows are compiled and manifest generated automatically
import manifest from './generated/manifest'
const result = await runtime.run(manifest['workflowName'], data)
```

The execution process is identical to declarative workflows — imperative style only affects how you write the code, not how you run it.

## Build Tool Plugins

| Plugin  | Package                     |
| ------- | --------------------------- |
| Vite    | `@flowcraft/plugin-vite`    |
| Next.js | `@flowcraft/plugin-nextjs`  |
| Nuxt    | `@flowcraft/plugin-nuxt`    |
| Astro   | `@flowcraft/plugin-astro`   |
| esbuild | `@flowcraft/plugin-esbuild` |
| tsup    | `@flowcraft/plugin-tsup`    |
