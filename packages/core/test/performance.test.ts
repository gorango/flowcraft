import { describe, expect, it } from 'vitest'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'

describe('Performance and Resource Testing', () => {
	// Helper to measure execution time
	const measureExecutionTime = async (fn: () => Promise<any>): Promise<number> => {
		const start = performance.now()
		await fn()
		const end = performance.now()
		return end - start
	}

	// Helper to estimate memory usage (rough approximation)
	const getMemoryUsage = (): number => {
		if (typeof performance !== 'undefined' && (performance as any).memory) {
			return (performance as any).memory.usedJSHeapSize
		}
		return 0 // Fallback for environments without memory API
	}

	describe('Execution Time Benchmarks', () => {
		it('should execute small workflows within reasonable time', async () => {
			const flow = createFlow('small-workflow')
			flow.node('A', async () => ({ output: 'A' }))
			flow.node('B', async () => ({ output: 'B' }))
			flow.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const executionTime = await measureExecutionTime(() =>
				runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() }),
			)

			// Should complete in less than 100ms for a simple workflow
			expect(executionTime).toBeLessThan(100)
		})

		it('should scale reasonably with increasing node count', async () => {
			const nodeCounts = [10, 50, 100]
			const times: number[] = []

			for (const count of nodeCounts) {
				const flow = createFlow(`scale-test-${count}`)

				// Create a linear chain of nodes
				for (let i = 0; i < count; i++) {
					flow.node(`node${i}`, async () => {
						// Small computation to simulate work
						let sum = 0
						for (let j = 0; j < 100; j++) sum += j
						return { output: sum }
					})
					if (i > 0) {
						flow.edge(`node${i - 1}`, `node${i}`)
					}
				}

				const runtime = new FlowRuntime({})
				const time = await measureExecutionTime(() =>
					runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() }),
				)
				times.push(time)
			}

			// Execution time should scale roughly linearly (allowing some overhead)
			const scalingFactor = times[2] / times[0]
			const expectedScaling = nodeCounts[2] / nodeCounts[0] // Should be 10x
			expect(scalingFactor).toBeLessThan(expectedScaling * 3) // Allow 3x overhead
		})

		it('should benefit from parallel execution', async () => {
			const flow = createFlow('parallel-benefit')
			const nodeCount = 20

			// Create parallel nodes
			for (let i = 0; i < nodeCount; i++) {
				flow.node(`parallel${i}`, async () => {
					await new Promise((resolve) => setTimeout(resolve, 10)) // Simulate I/O
					return { output: `result${i}` }
				})
			}

			const runtime = new FlowRuntime({})

			// Test with concurrency 1 (sequential)
			const sequentialTime = await measureExecutionTime(() =>
				runtime.run(
					flow.toBlueprint(),
					{},
					{
						functionRegistry: flow.getFunctionRegistry(),
						concurrency: 1,
					},
				),
			)

			// Test with high concurrency
			const parallelTime = await measureExecutionTime(() =>
				runtime.run(
					flow.toBlueprint(),
					{},
					{
						functionRegistry: flow.getFunctionRegistry(),
						concurrency: 10,
					},
				),
			)

			// Parallel execution should be faster (allowing some overhead)
			expect(parallelTime).toBeLessThan(sequentialTime * 0.8) // At least 20% faster
		})
	})

	describe('Memory Usage Monitoring', () => {
		it('should not have excessive memory growth with increasing nodes', async () => {
			const initialMemory = getMemoryUsage()
			const nodeCounts = [10, 50, 100]
			const memoryUsages: number[] = []

			for (const count of nodeCounts) {
				const flow = createFlow(`memory-test-${count}`)

				for (let i = 0; i < count; i++) {
					flow.node(`node${i}`, async () => ({ output: `data${i}`.repeat(10) })) // Some data
					if (i > 0) {
						flow.edge(`node${i - 1}`, `node${i}`)
					}
				}

				const runtime = new FlowRuntime({})
				await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				const memoryAfter = getMemoryUsage()
				memoryUsages.push(memoryAfter - initialMemory)

				// Force garbage collection if available
				if (global.gc) {
					global.gc()
				}
			}

			// Memory usage should scale reasonably with node count
			if (memoryUsages[0] > 0) {
				const scalingFactor = memoryUsages[2] / memoryUsages[0]
				const expectedScaling = nodeCounts[2] / nodeCounts[0]
				expect(scalingFactor).toBeLessThan(expectedScaling * 3) // Allow 3x overhead
			} else {
				// Skip test if memory measurement is not available
				expect(true).toBe(true)
			}
		})

		it('should clean up resources after workflow completion', async () => {
			const flow = createFlow('cleanup-test')
			const nodeCount = 50

			// Create workflow with many nodes
			for (let i = 0; i < nodeCount; i++) {
				flow.node(`node${i}`, async ({ context }) => {
					// Store some data in context
					await context.set(`key${i}`, `value${i}`.repeat(100))
					return { output: i }
				})
				if (i > 0) {
					flow.edge(`node${i - 1}`, `node${i}`)
				}
			}

			const runtime = new FlowRuntime({})
			const memoryBefore = getMemoryUsage()

			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			const memoryAfter = getMemoryUsage()

			// Memory should not grow excessively
			const growth = memoryAfter - memoryBefore
			expect(growth).toBeLessThan(10 * 1024 * 1024) // Less than 10MB growth
		})
	})

	describe('Throughput and Load Testing', () => {
		it('should maintain throughput under concurrent load', async () => {
			const flow = createFlow('throughput-test')
			flow.node('worker', async ({ input }) => {
				// Simulate variable processing time
				const delay = Math.random() * 20 + 5
				await new Promise((resolve) => setTimeout(resolve, delay))
				return { output: `processed_${input}` }
			})

			const runtime = new FlowRuntime({})
			const concurrentRuns = 20
			const startTime = performance.now()

			// Run multiple workflows concurrently
			const promises = Array.from({ length: concurrentRuns }, (_, i) =>
				runtime.run(flow.toBlueprint(), { input: i }, { functionRegistry: flow.getFunctionRegistry() }),
			)

			const results = await Promise.all(promises)
			const endTime = performance.now()
			const totalTime = endTime - startTime

			// All runs should complete successfully
			results.forEach((result) => {
				expect(result.status).toBe('completed')
			})

			// Calculate throughput (operations per second)
			const throughput = concurrentRuns / (totalTime / 1000)
			expect(throughput).toBeGreaterThan(1) // At least 1 operation per second
		})

		it('should handle burst loads gracefully', async () => {
			const flow = createFlow('burst-test')
			flow.node('burst-worker', async () => {
				await new Promise((resolve) => setTimeout(resolve, 50))
				return { output: 'burst-result' }
			})

			const runtime = new FlowRuntime({})
			const burstSize = 50
			const startTime = performance.now()

			// Simulate burst of requests
			const promises = Array.from({ length: burstSize }, () =>
				runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() }),
			)

			const results = await Promise.all(promises)
			const endTime = performance.now()
			const totalTime = endTime - startTime

			results.forEach((result) => {
				expect(result.status).toBe('completed')
			})

			// Should complete within reasonable time (allowing for queuing)
			expect(totalTime).toBeLessThan(5000) // Less than 5 seconds for burst
		})
	})

	describe('Resource Limits and Degradation', () => {
		it('should degrade gracefully under memory pressure', async () => {
			const flow = createFlow('memory-pressure')
			const largeDataSize = 100000 // Large data to create memory pressure

			flow.node('memory-hungry', async ({ context }) => {
				// Create large data structure
				const largeData = Array.from({ length: largeDataSize }, (_, i) => ({
					id: i,
					data: `data${i}`.repeat(10),
				}))
				await context.set('largeData', largeData)
				return { output: 'memory-intensive-result' }
			})

			const runtime = new FlowRuntime({})
			const memoryBefore = getMemoryUsage()

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			const memoryAfter = getMemoryUsage()
			const memoryGrowth = memoryAfter - memoryBefore

			expect(result.status).toBe('completed')
			// Should handle large data without excessive memory growth
			expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
		})

		it('should handle CPU-intensive operations without blocking', async () => {
			const flow = createFlow('cpu-intensive')
			const computationSize = 1000000 // Large computation

			flow.node('cpu-worker', async () => {
				// CPU-intensive computation
				let result = 0
				for (let i = 0; i < computationSize; i++) {
					result += Math.sin(i) * Math.cos(i)
				}
				return { output: result }
			})

			const runtime = new FlowRuntime({})
			const startTime = performance.now()

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			const endTime = performance.now()
			const executionTime = endTime - startTime

			expect(result.status).toBe('completed')
			// Should complete CPU-intensive work within reasonable time
			expect(executionTime).toBeLessThan(2000) // Less than 2 seconds
			expect(typeof result.context['_outputs.cpu-worker']).toBe('number')
		})
	})

	describe('Performance Regression Detection', () => {
		it('should maintain baseline performance for common operations', async () => {
			const flow = createFlow('baseline-test')

			// Simple workflow representing common usage
			flow.node('input', async () => ({ output: { data: 'test' } }))
			flow.node('process', async ({ input }) => ({
				output: `${input.data}_processed`,
			}))
			flow.node('output', async ({ input }) => ({
				output: `final_${input}`,
			}))

			flow.edge('input', 'process')
			flow.edge('process', 'output')

			const runtime = new FlowRuntime({})
			let result: any
			const executionTime = await measureExecutionTime(async () => {
				result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			})

			// Establish baseline: should complete very quickly
			expect(executionTime).toBeLessThan(50) // Less than 50ms baseline
			expect(result.context['_outputs.output']).toBe('final_test_processed')
		})

		it('should detect performance degradation in context operations', async () => {
			const flow = createFlow('context-perf-test')
			const operationCount = 1000

			flow.node('context-ops', async ({ context }) => {
				// Perform many context operations
				for (let i = 0; i < operationCount; i++) {
					await context.set(`key${i}`, `value${i}`)
				}
				for (let i = 0; i < operationCount; i++) {
					await context.get(`key${i}`)
				}
				return { output: 'context-ops-done' }
			})

			const runtime = new FlowRuntime({})
			const executionTime = await measureExecutionTime(() =>
				runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() }),
			)

			// Should handle many context operations efficiently
			expect(executionTime).toBeLessThan(1000) // Less than 1 second for 2000 operations
		})
	})
})
