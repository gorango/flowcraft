import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		coverage: {
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/index.ts', 'src/**/*.d.ts'],
			reporter: ['text', 'json', 'html', 'lcov'],
			thresholds: {
				global: {
					lines: 85,
					functions: 85,
					branches: 80,
					statements: 85,
				},
				'src/runtime.ts': {
					lines: 90,
					functions: 90,
					branches: 85,
					statements: 90,
				},
				'src/flow.ts': {
					lines: 90,
					functions: 90,
					branches: 65,
					statements: 90,
				},
				'src/evaluator.ts': {
					lines: 85,
					functions: 85,
					branches: 80,
					statements: 85,
				},
			},
		},
	},
})
