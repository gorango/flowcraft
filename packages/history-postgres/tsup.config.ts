import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	target: 'esnext',
	dts: true,
	clean: true,
	sourcemap: true,
	splitting: false,
	treeshake: true,
	minify: false,
})
