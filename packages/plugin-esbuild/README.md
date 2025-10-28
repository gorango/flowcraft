# @flowcraft/esbuild-plugin

esbuild plugin for automatic Flowcraft workflow compilation.

## Installation

```bash
npm install @flowcraft/esbuild-plugin
```

## Usage

Add the plugin to your esbuild configuration:

```js
import { build } from 'esbuild'
import flowcraftPlugin from '@flowcraft/esbuild-plugin'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  plugins: [
    flowcraftPlugin({
      // Optional: customize compiler options
      // srcDir: './flows',
      // outDir: './.flowcraft'
    })
  ],
  // ... other options
})
```

## Options

The plugin accepts the same options as the Flowcraft compiler:

- `srcDir`: Directory containing flow files (default: `'./flows'`)
- `outDir`: Output directory for compiled flows (default: `'./.flowcraft'`)
- `include`: Glob patterns for flow files (default: `['**/*.flow.ts']`)
- `exclude`: Glob patterns to exclude (default: `['**/node_modules/**']`)

See the [@flowcraft/compiler README](../compiler/README.md) for detailed configuration options.