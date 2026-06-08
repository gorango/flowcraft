import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/**/*.ts'],
	format: ['cjs'],
	target: 'es2017',
	dts: false, // Skip DTS for now due to workspace dependency issues
	clean: true,
	sourcemap: false,

	treeshake: true,
	minify: false,
})
