import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/**/*.ts'],
	entryPoints: ['src/index.ts'],
	format: ['cjs'],
	target: 'es2017',
	dts: true,
	clean: true,
	sourcemap: true,
	splitting: false,
	treeshake: true,
	minify: false,
})
