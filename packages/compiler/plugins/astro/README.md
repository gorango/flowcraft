# @flowcraft/astro-integration

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@flowcraft/astro-integration.svg)](https://www.npmjs.com/package/@flowcraft/astro-integration)

Astro integration for automatic Flowcraft workflow compilation.

## Installation

```bash
npm install @flowcraft/astro-integration
```

## Usage

Add the integration to your `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import flowcraftIntegration from '@flowcraft/astro-integration'

export default defineConfig({
	integrations: [
		flowcraftIntegration({
			// Optional: customize compiler options
			// srcDir: './flows',
			// outDir: './.flowcraft'
		}),
	],
})
```

## Options

The integration accepts the same options as the Flowcraft compiler:

- `srcDir`: Directory containing flow files (default: `'./flows'`)
- `outDir`: Output directory for compiled flows (default: `'./.flowcraft'`)
- `include`: Glob patterns for flow files (default: `['**/*.flow.ts']`)
- `exclude`: Glob patterns to exclude (default: `['**/node_modules/**']`)

See the [@flowcraft/compiler README](../compiler/README.md) for detailed configuration options.

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
