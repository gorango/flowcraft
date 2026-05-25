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
				statements: 85,
				branches: 70,
				functions: 85,
				lines: 85,
			},
		},
	},
})
