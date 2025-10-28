# Build Tool Integration

Integrate the Flowcraft Compiler into your existing build pipeline with these ready-to-use configurations.

## Vite

Install the Vite plugin:

```bash
npm install --save-dev @flowcraft/plugin-vite
```

Update your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import flowcraft from '@flowcraft/plugin-vite'

export default defineConfig({
  plugins: [
    flowcraft({
      // Optional: override config file path
      configPath: './flowcraft.config.ts'
    })
  ]
})
```

## Next.js

Install the Next.js plugin:

```bash
npm install --save-dev @flowcraft/plugin-next
```

Update your `next.config.js`:

```javascript
const flowcraft = require('@flowcraft/plugin-next')

module.exports = flowcraft({
  // Your Next.js config
  experimental: {
    // ... other options
  }
})
```

## Nuxt

Install the Nuxt plugin:

```bash
npm install --save-dev @flowcraft/plugin-nuxt
```

Update your `nuxt.config.ts`:

```typescript
import flowcraft from '@flowcraft/plugin-nuxt'

export default defineNuxtConfig({
  modules: [
    flowcraft
  ]
})
```

## Astro

Install the Astro plugin:

```bash
npm install --save-dev @flowcraft/plugin-astro
```

Update your `astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config'
import flowcraft from '@flowcraft/plugin-astro'

export default defineConfig({
  integrations: [
    flowcraft()
  ]
})
```

## esbuild

Install the esbuild plugin:

```bash
npm install --save-dev @flowcraft/plugin-esbuild
```

Update your build script:

```javascript
import esbuild from 'esbuild'
import flowcraft from '@flowcraft/plugin-esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  plugins: [
    flowcraft({
      configPath: './flowcraft.config.ts'
    })
  ],
  outdir: 'dist'
})
```

## tsup

Install the tsup plugin:

```bash
npm install --save-dev @flowcraft/plugin-tsup
```

Update your `tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup'
import { buildFlows } from '@flowcraft/compiler'

export default defineConfig({
  entry: ['src/index.ts'],
  // ... your other tsup options

  async onSuccess() {
  // This hook runs after tsup completes its build
    await buildFlows();
  },
});
```

## Manual Integration

If your build tool isn't supported, you can integrate the compiler manually:

```javascript
// build.js
import { buildFlows } from '@flowcraft/compiler'

export async function build() {
  // Compile workflows first
  await buildFlows()

  // Then run your normal build process
  // ... your build logic
}
```

Add this to your `package.json`:

```json
{
  "scripts": {
    "build": "node build.js"
  }
}
```
