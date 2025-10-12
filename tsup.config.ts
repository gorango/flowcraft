import { defineConfig } from 'tsup'

export default defineConfig({
	entry: [
		'src/**/*.ts',
		'!src/**/*.test.ts',
		'!src/test-utils/**/*.ts',
	],
	entryPoints: ['src/index.ts'],
	format: ['esm'],
	target: 'esnext',
	dts: true,
	clean: true,
	sourcemap: true,
	splitting: true,
	treeshake: true,
	minify: false,
})
