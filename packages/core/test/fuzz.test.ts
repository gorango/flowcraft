import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { UnsafeEvaluator } from '../src/evaluator'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'

beforeAll(() => {
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
	vi.restoreAllMocks()
})

// Helper to generate random strings
const randomString = (length: number): string => {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?`~'
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

// Helper to generate random objects with various types
const generateRandomObject = (depth = 0): any => {
	if (depth > 3) return randomString(10) // Prevent infinite recursion

	const types = ['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined']
	const type = types[Math.floor(Math.random() * types.length)]

	switch (type) {
		case 'string':
			return randomString(Math.floor(Math.random() * 100))
		case 'number':
			return Math.random() * 1000000 - 500000 // Random number between -500k and 500k
		case 'boolean':
			return Math.random() > 0.5
		case 'object': {
			const obj: any = {}
			const numProps = Math.floor(Math.random() * 10)
			for (let i = 0; i < numProps; i++) {
				obj[randomString(10)] = generateRandomObject(depth + 1)
			}
			return obj
		}
		case 'array': {
			const arr = []
			const length = Math.floor(Math.random() * 20)
			for (let i = 0; i < length; i++) {
				arr.push(generateRandomObject(depth + 1))
			}
			return arr
		}
		case 'null':
			return null
		case 'undefined':
			return undefined
		default:
			return randomString(10)
	}
}

describe('Fuzz Testing - Malformed Input Handling', () => {
	describe('Blueprint Structure Fuzzing', () => {
		it('should handle malformed blueprint JSON', async () => {
			const malformedBlueprints = [
				{ nodes: null, edges: [] },
				{ nodes: {}, edges: null },
				{ nodes: { node1: null }, edges: [] },
				{ nodes: { node1: { id: 'node1' } }, edges: [{ from: null, to: 'node1' }] },
				{ nodes: { node1: { id: 'node1' } }, edges: [{ from: 'node1', to: null }] },
				{ nodes: { node1: { id: 'node1', config: 'invalid' } }, edges: [] },
			]

			const runtime = new FlowRuntime({})

			for (const blueprint of malformedBlueprints) {
				try {
					const result = await runtime.run(blueprint as any, {}, {})
					// Should either complete or fail gracefully, not crash
					expect(['completed', 'failed']).toContain(result.status)
				} catch (error) {
					// Expected for some malformed inputs
					expect(error).toBeDefined()
				}
			}
		})

		it('should handle blueprints with circular references', async () => {
			const circularObj: any = { prop: 'value' }
			circularObj.self = circularObj

			const blueprint = {
				nodes: {
					node1: {
						id: 'node1',
						config: circularObj,
					},
				},
				edges: [],
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(blueprint as any, {}, {})

			// Should handle circular references gracefully
			expect(['completed', 'failed']).toContain(result.status)
		})

		it('should handle extremely large blueprints', async () => {
			const largeBlueprint: any = { nodes: {}, edges: [] }

			// Create many nodes
			for (let i = 0; i < 1000; i++) {
				largeBlueprint.nodes[`node${i}`] = {
					id: `node${i}`,
					implementation: 'async () => ({ output: "test" })',
				}
				if (i > 0) {
					largeBlueprint.edges.push({
						from: `node${i - 1}`,
						to: `node${i}`,
					})
				}
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(largeBlueprint, {}, {})

			// Should handle large blueprints without crashing
			expect(['completed', 'failed']).toContain(result.status)
		})
	})

	describe('Node Function Fuzzing', () => {
		it('should handle nodes that return malformed outputs', async () => {
			const malformedOutputs = [
				() => 'string instead of object',
				() => 42,
				() => true,
				() => [],
				() => null,
				() => undefined,
				() => ({ output: undefined }),
				() => ({ output: null }),
				() => ({ output: { circular: {} } }), // Will create circular reference
				() => ({ output: generateRandomObject() }),
			]

			for (const outputFunc of malformedOutputs) {
				const flow = createFlow(`fuzz-output-${Math.random()}`)
				flow.node('test-node', outputFunc as any)

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				// Should handle malformed outputs gracefully
				expect(['completed', 'failed']).toContain(result.status)
			}
		})

		it('should handle nodes that throw various error types', async () => {
			const errorTypes = [
				'string error',
				42,
				null,
				undefined,
				{ error: 'object' },
				new Error('proper error'),
				new TypeError('type error'),
				new ReferenceError('reference error'),
				generateRandomObject(),
			]

			for (const error of errorTypes) {
				const flow = createFlow(`fuzz-error-${Math.random()}`)
				flow.node('error-node', async () => {
					throw error
				})

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('failed')
				expect(result.errors).toBeDefined()
				expect(result.errors?.length).toBeGreaterThan(0)
			}
		})

		it('should handle nodes with extremely long execution times', async () => {
			const flow = createFlow('long-running-fuzz')
			flow.node('slow-node', async () => {
				// Simulate very long operation
				await new Promise((resolve) => setTimeout(resolve, 100)) // Long but not infinite
				return { output: 'completed' }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
		})
	})

	describe('Context Data Fuzzing', () => {
		it('should handle random context data', async () => {
			const flow = createFlow('context-fuzz')
			flow.node('context-reader', async ({ context }) => {
				const keys = ['key1', 'key2', 'random_key', '', 'special@key']
				const results: any = {}

				for (const key of keys) {
					try {
						results[key] = await context.get(key)
					} catch (error) {
						results[key] = `error: ${error}`
					}
				}

				return { output: results }
			})

			// Generate random context data
			const randomContext: any = {}
			for (let i = 0; i < 20; i++) {
				randomContext[randomString(10)] = generateRandomObject()
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), randomContext, {
				functionRegistry: flow.getFunctionRegistry(),
			})

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.context-reader']).toBeDefined()
		})

		it('should handle context operations with malformed keys', async () => {
			const malformedKeys = [
				'',
				'   ',
				'@#$%^&*()',
				'key.with.dots',
				'key/with/slashes',
				'key with spaces',
				'\u0000\u0001\u0002', // Control characters
				'🔥💯🚀', // Emojis
				'a'.repeat(1000), // Very long key
				42, // Number as key
				null,
				undefined,
				{}, // Object as key
				[], // Array as key
			]

			const flow = createFlow('key-fuzz')
			flow.node('key-operations', async ({ context }) => {
				const results: any = {}

				for (const key of malformedKeys) {
					try {
						await context.set(key as any, `value_for_${String(key)}`)
						results[`set_${String(key)}`] = 'success'
					} catch (error) {
						results[`set_${String(key)}`] = `error: ${error}`
					}

					try {
						const value = await context.get(key as any)
						results[`get_${String(key)}`] = value
					} catch (error) {
						results[`get_${String(key)}`] = `error: ${error}`
					}
				}

				return { output: results }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			// Should handle malformed keys gracefully
			expect(['completed', 'failed']).toContain(result.status)
		})
	})

	describe('Expression and Evaluator Fuzzing', () => {
		it('should handle malformed expressions in transforms', async () => {
			const malformedExpressions = [
				'',
				'   ',
				'invalid syntax {{{',
				'result.output.',
				'result?.output?.missing?.property',
				'result.output + undefined_variable',
				'throw new Error("test")',
				'function() { return "test"; }',
				'result.output.map(x => x.nonexistent)',
				'result.output.filter(x => x?.invalid?.chain)',
				randomString(1000), // Very long expression
			]

			const evaluator = new UnsafeEvaluator()

			for (const expr of malformedExpressions) {
				const flow = createFlow(`expr-fuzz-${Math.random()}`)
				flow.node('source', async () => ({ output: { value: 42, nested: { prop: 'test' } } }))
				flow.node('transform', async ({ input }) => ({ output: input }), {
					inputs: { data: 'source' },
				})
				flow.edge('source', 'transform', { transform: expr })

				const runtime = new FlowRuntime({ evaluator })
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				// Should handle malformed expressions gracefully
				expect(['completed', 'failed']).toContain(result.status)
			}
		})

		it('should handle malformed expressions in conditions', async () => {
			const malformedConditions = [
				'',
				'invalid ===',
				'result.output.missing > 10',
				'undefined_variable === true',
				'result?.output?.nested?.missing',
				'throw "error"',
				'result.output && invalid_syntax',
				randomString(500),
			]

			const evaluator = new UnsafeEvaluator()

			for (const condition of malformedConditions) {
				const flow = createFlow(`condition-fuzz-${Math.random()}`)
				flow.node('source', async () => ({ output: { status: 'ok', value: 100 } }))
				flow.node('true-path', async () => ({ output: 'took-true-path' }))
				flow.node('false-path', async () => ({ output: 'took-false-path' }))

				flow.edge('source', 'true-path', { condition })
				flow.edge('source', 'false-path')

				const runtime = new FlowRuntime({ evaluator })
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				// Should handle malformed conditions gracefully
				expect(['completed', 'failed']).toContain(result.status)
			}
		})
	})

	describe('Concurrency and Parallel Execution Fuzzing', () => {
		it('should handle random concurrency levels', async () => {
			const concurrencyLevels = [0, 1, 5, 10, 50, 100, -1, -5]

			for (const concurrency of concurrencyLevels) {
				const flow = createFlow(`concurrency-fuzz-${concurrency}`)
				const nodeCount = Math.min(20, Math.max(1, concurrency * 2))

				// Create parallel nodes
				for (let i = 0; i < nodeCount; i++) {
					flow.node(`node${i}`, async () => {
						await new Promise((resolve) => setTimeout(resolve, Math.random() * 20))
						return { output: generateRandomObject() }
					})
				}

				const runtime = new FlowRuntime({})
				const result = await runtime.run(
					flow.toBlueprint(),
					{},
					{
						functionRegistry: flow.getFunctionRegistry(),
						concurrency: concurrency > 0 ? concurrency : undefined,
					},
				)

				// Should handle various concurrency levels
				expect(['completed', 'failed']).toContain(result.status)
			}
		})

		it('should handle race conditions with random delays', async () => {
			const flow = createFlow('race-condition-fuzz')
			const nodeCount = 10

			for (let i = 0; i < nodeCount; i++) {
				flow.node(`racer${i}`, async ({ context }) => {
					const delay = Math.random() * 50
					await new Promise((resolve) => setTimeout(resolve, delay))

					const current = (await context.get('shared_counter')) || 0
					await context.set('shared_counter', current + 1)

					return { output: `racer${i}_completed` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{ shared_counter: 0 },
				{
					functionRegistry: flow.getFunctionRegistry(),
					concurrency: 5, // Allow some parallelism
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context.shared_counter).toBe(nodeCount)
		})
	})

	describe('Memory and Resource Exhaustion Fuzzing', () => {
		it('should handle large data structures', async () => {
			const flow = createFlow('memory-fuzz')
			flow.node('large-data-producer', async () => {
				const largeData = Array.from({ length: 10000 }, (_, i) => ({
					id: i,
					data: randomString(100),
					nested: generateRandomObject(2),
				}))
				return { output: largeData }
			})

			flow.node('large-data-consumer', async ({ input }) => {
				// Process large data
				const processed = (input as any[]).map((item) => ({
					...item,
					processed: true,
					hash: item.data.length,
				}))
				return { output: processed.length }
			})

			flow.edge('large-data-producer', 'large-data-consumer')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.large-data-consumer']).toBe(10000)
		})

		it('should handle deep recursion in data structures', async () => {
			const createDeepObject = (depth: number): any => {
				if (depth <= 0) return { value: 'deep' }
				return {
					level: depth,
					nested: createDeepObject(depth - 1),
				}
			}

			const flow = createFlow('deep-recursion-fuzz')
			flow.node('deep-producer', async () => ({
				output: createDeepObject(50), // Very deep object
			}))

			flow.node('deep-consumer', async ({ input }): Promise<any> => {
				// Try to access deeply nested property
				let current = input
				let depth = 0
				try {
					while (current && typeof current === 'object' && current.nested) {
						current = current.nested
						depth++
					}
					return { output: { maxDepth: depth, finalValue: current, error: undefined, reachedDepth: undefined } }
				} catch (error) {
					return { output: { maxDepth: undefined, finalValue: undefined, error: String(error), reachedDepth: depth } }
				}
			})

			flow.edge('deep-producer', 'deep-consumer')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
		})
	})

	describe('Unicode and Internationalization Fuzzing', () => {
		it('should handle various Unicode characters', async () => {
			const unicodeStrings = [
				'Hello 世界 🌍',
				'🚀 🔥 💯',
				'café naïve résumé',
				'العربية',
				'日本語',
				'русский',
				'emoji: 😀🎉🎊',
				'combining: a\u0300\u0301\u0302', // Combining characters
				'control: \u0000\u0001\u0002',
				'whitespace: \u00A0\u2000\u2001\u2002',
				'rtl: مرحبا بالعالم',
				'zero-width: \u200B\u200C\u200D\uFEFF',
			]

			for (const unicodeStr of unicodeStrings) {
				const flow = createFlow(`unicode-fuzz-${Math.random()}`)
				flow.node('unicode-producer', async () => ({ output: unicodeStr }))
				flow.node('unicode-consumer', async ({ input }) => ({
					output: `processed: ${input}`.length,
				}))
				flow.edge('unicode-producer', 'unicode-consumer')

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
			}
		})

		it('should handle malformed UTF-8 sequences', async () => {
			const malformedUtf8 = [
				Buffer.from([0xc0, 0x80]).toString(), // Overlong encoding
				Buffer.from([0xe0, 0x80, 0x80]).toString(), // Overlong encoding
				Buffer.from([0xf0, 0x80, 0x80, 0x80]).toString(), // Overlong encoding
				Buffer.from([0x80]).toString(), // Invalid start byte
				Buffer.from([0xc0]).toString(), // Incomplete sequence
				Buffer.from([0xe0, 0x80]).toString(), // Incomplete sequence
				Buffer.from([0xff, 0xfe, 0xfd]).toString(), // Invalid bytes
			]

			for (const malformed of malformedUtf8) {
				const flow = createFlow(`utf8-fuzz-${Math.random()}`)
				flow.node('malformed-producer', async () => ({ output: malformed }))

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				// Should handle malformed UTF-8 gracefully
				expect(['completed', 'failed']).toContain(result.status)
			}
		})
	})
})
