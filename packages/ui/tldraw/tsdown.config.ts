import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/**/*.ts', 'src/**/*.tsx'],
	format: ['esm'],
	target: 'esnext',
	dts: true,
	clean: true,
	sourcemap: false,
	treeshake: true,
	minify: false,
	deps: {
		neverBundle: ['react', 'react-dom', 'tldraw', 'flowcraft', '@tldraw/validate'],
	},
})
