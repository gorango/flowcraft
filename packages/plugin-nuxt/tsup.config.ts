import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/**/*.ts'],
	entryPoints: ['src/index.ts'],
	format: ['cjs'],
	target: 'es2017',
	dts: false, // Skip DTS for now due to workspace dependency issues
	clean: true,
	sourcemap: true,
	splitting: false,
	treeshake: true,
	minify: false,
})
