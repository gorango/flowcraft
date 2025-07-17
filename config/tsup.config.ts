import { defineConfig } from 'tsup'

export default defineConfig({
	entry: [
		'src/workflow.ts',
		'src/fn.ts',
		'src/builder/index.ts',
	],
	format: ['esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	minify: true,
})
