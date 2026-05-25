import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		testTimeout: 15000,
		coverage: {
			include: ['src/**/*.ts'],
			reporter: ['text', 'json', 'html', 'lcov'],
			thresholds: {
				statements: 92,
				branches: 76,
				functions: 95,
				lines: 92,
			},
		},
	},
})
