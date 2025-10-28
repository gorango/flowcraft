# Compiler Configuration

Learn how to install and configure the Flowcraft Compiler in your project.

## Installation

Install the compiler as a development dependency:

```bash
npm install --save-dev @flowcraft/compiler
```

## `flowcraft.config.ts`

Create a `flowcraft.config.ts` file in your project root to configure the compiler:

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

- **`entryPoints`**: Glob patterns matching your workflow files. These should contain functions marked with `/** @flow */`.
- **`manifestPath`**: Where the compiler will write the generated manifest containing all compiled blueprints.
- **`tsConfigPath`**: Path to your TypeScript configuration file. Used for type checking and module resolution.

## Programmatic Usage

You can also run the compiler programmatically in build scripts:

```javascript
// scripts/compile-flows.js
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

// The result also includes:
// - result.blueprints: Array of compiled blueprint objects
// - result.registry: Registry of all discovered flows and steps
```

For convenience, you can use `buildFlows()` which handles config loading and file writing automatically:

```javascript
import { buildFlows } from '@flowcraft/compiler'

// Loads flowcraft.config.ts and compiles all workflows
await buildFlows()
```

## Executing Compiled Workflows

After compilation, execute your imperative workflows using the standard Flowcraft runtime:

```typescript
import { FlowRuntime } from 'flowcraft'
import manifest from './src/generated/manifest.ts'

// Create runtime instance
const runtime = new FlowRuntime()

// Execute a compiled workflow
const result = await runtime.run(manifest['myWorkflow'], {
  inputParam: 'value'
})

console.log('Execution result:', result)
```

### Direct Blueprint Execution

You can also execute blueprints directly without the manifest:

```typescript
import { compileProject } from '@flowcraft/compiler'
import { FlowRuntime } from 'flowcraft'

const compilationResult = await compileProject({
  entryPoints: ['./src/workflows/**/*.ts']
})

const blueprint = compilationResult.blueprints.find(b => b.id === 'myWorkflow')
const runtime = new FlowRuntime()

const result = await runtime.run(blueprint, initialData)
```

### Build Tool Integration

When using build tool plugins, compilation happens automatically:

```typescript
// With Vite plugin - compilation happens during build
import flowcraft from '@flowcraft/plugin-vite'

// Workflows are compiled and manifest generated automatically
// Just import and run
import manifest from './generated/manifest.ts'
const result = await runtime.run(manifest['workflowName'], data)
```

The execution process is identical to declarative workflows - imperative style only affects how you write the code, not how you run it.
