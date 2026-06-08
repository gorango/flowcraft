# @flowcraft/next-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@flowcraft/next-plugin.svg)](https://www.npmjs.com/package/@flowcraft/next-plugin)

Next.js plugin for automatic Flowcraft workflow compilation.

## Installation

```bash
npm install @flowcraft/next-plugin
```

## Usage

Update your `next.config.js`:

```javascript
const { withFlowcraft } = require('@flowcraft/next-plugin')

module.exports = withFlowcraft({
	// ... your Next.js config
})
```

Your Flowcraft workflows will be automatically compiled during production builds.

## Development Mode

For development, the plugin currently only runs during production builds to avoid conflicts with Next.js Fast Refresh. You can run the compiler manually or set up a file watcher:

```bash
# Run once
npx @flowcraft/compiler

# Or set up a watcher
npx @flowcraft/compiler --watch
```

See the [@flowcraft/compiler README](../compiler/README.md) for more details.

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
