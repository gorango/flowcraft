# @flowcraft/nuxt-module

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@flowcraft/nuxt-module.svg)](https://www.npmjs.com/package/@flowcraft/nuxt-module)

Nuxt module for automatic Flowcraft workflow compilation.

## Installation

```bash
npm install @flowcraft/nuxt-module
```

## Usage

Add the module to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
	modules: ['@flowcraft/nuxt-module'],
	flowcraft: {
		// Flowcraft compiler options (optional)
		srcDir: './flows',
		outDir: './.flowcraft',
	},
})
```

## Options

The module accepts the same options as the Flowcraft compiler:

- `srcDir`: Directory containing flow files (default: `'./flows'`)
- `outDir`: Output directory for compiled flows (default: `'./.flowcraft'`)
- `include`: Glob patterns for flow files (default: `['**/*.flow.ts']`)
- `exclude`: Glob patterns to exclude (default: `['**/node_modules/**']`)

See the [@flowcraft/compiler README](../compiler/README.md) for detailed configuration options.

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
