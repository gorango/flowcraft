import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/**/*.ts'],
	format: ['esm'],
	target: 'esnext',
	dts: true,
	clean: true,
	sourcemap: false,
	treeshake: true,
	minify: false,
})
