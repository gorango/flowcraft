import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['cjs'],
	target: 'es2017',
	dts: true,
	clean: true,
	sourcemap: false,

	treeshake: true,
	minify: false,
})
