import { defineConfig } from 'tsdown'

export default defineConfig([
	{
		entry: ['src/index.ts'],
		format: ['esm'],
		target: 'esnext',
		dts: true,
		clean: true,
		sourcemap: false,
		treeshake: true,
		minify: false,
	},
	{
		entry: ['src/browser.ts'],
		format: ['esm'],
		target: 'esnext',
		dts: true,
		clean: false,
		sourcemap: false,
		treeshake: true,
		minify: true,
	},
])
