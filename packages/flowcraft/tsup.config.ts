import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/**/*.ts'],
	entryPoints: ['src/index.ts', 'src/testing/index.ts'],
	format: ['esm'],
	target: 'esnext',
	dts: true,
	clean: true,
	sourcemap: true,
	splitting: true,
	treeshake: true,
	minify: false,
})
