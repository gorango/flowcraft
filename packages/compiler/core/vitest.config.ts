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
				statements: 90,
				branches: 70,
				functions: 90,
				lines: 90,
			},
		},
	},
})
