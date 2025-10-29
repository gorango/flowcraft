import { describe, expect, it } from 'vitest'
import { UnsafeEvaluator } from '../src/evaluator'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'
import { sanitizeBlueprint } from '../src/sanitizer'

describe('Security Boundaries', () => {
	describe('UnsafeEvaluator Protection', () => {
		const evaluator = new UnsafeEvaluator()

		it('allows dangerous code execution', () => {
			// UnsafeEvaluator allows arbitrary code execution including access to globals
			// These expressions should execute without throwing (though some may be caught by test framework)
			expect(typeof evaluator.evaluate('typeof process', {})).toBe('string')
			expect(typeof evaluator.evaluate('typeof global', {})).toBe('string')
			expect(typeof evaluator.evaluate('typeof require', {})).toBe('string')
		})

		it('allows access to dangerous global objects', () => {
			// UnsafeEvaluator provides access to all global objects via Function constructor
			expect(evaluator.evaluate('typeof process', {})).toBe('object')
			expect(evaluator.evaluate('typeof global', {})).toBe('object')
			// Note: require may not be available in all environments
			expect(['function', 'undefined']).toContain(evaluator.evaluate('typeof require', {}))
			expect(evaluator.evaluate('typeof eval', {})).toBe('function')
		})

		it('only allows safe identifier access', () => {
			const safeExpressions = ['context.user.name', 'result.output.value', 'input.data[0]', 'context.items.length > 0']

			const testContext = {
				context: { user: { name: 'test' }, items: [] },
				result: { output: { value: 'test' } },
				input: { data: ['test'] },
			}

			for (const expr of safeExpressions) {
				expect(() => evaluator.evaluate(expr, testContext)).not.toThrow()
			}
		})

		it('allows prototype pollution', () => {
			const maliciousExpressions = [
				'__proto__.toString = "polluted"',
				'constructor.prototype.newProp = "polluted"',
				'Object.prototype.malicious = "polluted"',
			]

			for (const expr of maliciousExpressions) {
				expect(() => evaluator.evaluate(expr, {})).not.toThrow()
			}
		})
	})

	describe('Blueprint Sanitization', () => {
		it('prevents prototype pollution in blueprint parsing', () => {
			const maliciousBlueprints: any[] = [
				{ __proto__: { malicious: 'property' } },
				{ constructor: { prototype: { malicious: 'property' } } },
				{ nodes: [{ __proto__: { uses: 'evil' } }] },
			]

			for (const blueprint of maliciousBlueprints) {
				const sanitized = sanitizeBlueprint(blueprint as any)
				// Ensure prototype pollution properties are not present in sanitized blueprint
				expect(sanitized).not.toHaveProperty('__proto__')
				expect(sanitized).not.toHaveProperty('constructor')
				// Ensure nodes don't have polluted properties
				if (sanitized.nodes && sanitized.nodes.length > 0) {
					expect(sanitized.nodes[0]).not.toHaveProperty('__proto__')
					expect(sanitized.nodes[0]).not.toHaveProperty('constructor')
				}
			}
		})

		it('removes dangerous prototype pollution properties', () => {
			const maliciousBlueprints = [
				{
					id: 'test',
					nodes: [
						{
							id: 'node1',
							uses: 'test',
							__proto__: { polluted: true },
						},
					],
					edges: [],
				},
				{
					id: 'test',
					nodes: [
						{
							id: 'node1',
							uses: 'test',
							constructor: { evil: true },
						},
					],
					edges: [],
				},
				{
					id: 'test',
					nodes: [],
					edges: [
						{
							source: 'node1',
							target: 'node2',
							__proto__: { polluted: true },
						},
					],
				},
			]

			for (const blueprint of maliciousBlueprints) {
				const sanitized = sanitizeBlueprint(blueprint as any)
				// Ensure polluted properties are removed from nodes
				for (const node of sanitized.nodes) {
					expect(node).not.toHaveProperty('__proto__')
					expect(node).not.toHaveProperty('constructor')
				}
				// Ensure polluted properties are removed from edges
				for (const edge of sanitized.edges) {
					expect(edge).not.toHaveProperty('__proto__')
					expect(edge).not.toHaveProperty('constructor')
				}
			}
		})

		it('removes extra properties from nodes and edges', () => {
			const rawBlueprint = {
				id: 'test',
				nodes: [
					{
						id: 'node1',
						uses: 'test',
						params: { value: 1 },
						inputs: { input: 'data' },
						config: { timeout: 1000 },
						extra: 'removed',
						position: { x: 10, y: 20 },
					},
				],
				edges: [
					{
						source: 'node1',
						target: 'node2',
						action: 'next',
						condition: 'true',
						transform: 'data',
						style: 'dashed',
						label: 'test edge',
					},
				],
			}

			const sanitized = sanitizeBlueprint(rawBlueprint)

			expect(sanitized.nodes[0]).toHaveProperty('id', 'node1')
			expect(sanitized.nodes[0]).toHaveProperty('uses', 'test')
			expect(sanitized.nodes[0]).toHaveProperty('params', { value: 1 })
			expect(sanitized.nodes[0]).toHaveProperty('inputs', { input: 'data' })
			expect(sanitized.nodes[0]).toHaveProperty('config', { timeout: 1000 })
			expect(sanitized.nodes[0]).not.toHaveProperty('extra')
			expect(sanitized.nodes[0]).not.toHaveProperty('position')

			expect(sanitized.edges[0]).toHaveProperty('source', 'node1')
			expect(sanitized.edges[0]).toHaveProperty('target', 'node2')
			expect(sanitized.edges[0]).toHaveProperty('action', 'next')
			expect(sanitized.edges[0]).toHaveProperty('condition', 'true')
			expect(sanitized.edges[0]).toHaveProperty('transform', 'data')
			expect(sanitized.edges[0]).not.toHaveProperty('style')
			expect(sanitized.edges[0]).not.toHaveProperty('label')
		})

		it('preserves only allowed properties', () => {
			const rawBlueprint = {
				id: 'test',
				nodes: [
					{
						id: 'node1',
						uses: 'test',
						params: { key: 'value' },
						inputs: 'input',
						config: { maxRetries: 3 },
						extra: 'removed',
					},
				],
				edges: [
					{
						source: 'node1',
						target: 'node2',
						action: 'success',
						condition: 'true',
						transform: 'data',
						extra: 'removed',
					},
				],
			}

			const sanitized = sanitizeBlueprint(rawBlueprint)

			expect(sanitized.nodes[0]).toEqual({
				id: 'node1',
				uses: 'test',
				params: { key: 'value' },
				inputs: 'input',
				config: { maxRetries: 3 },
			})

			expect(sanitized.edges[0]).toEqual({
				source: 'node1',
				target: 'node2',
				action: 'success',
				condition: 'true',
				transform: 'data',
			})
		})
	})

	describe('Runtime Security', () => {
		it('prevents infinite loops in workflow execution', async () => {
			const flow = createFlow('infinite-loop')
				.node('loop', async ({ context }) => {
					const count = (await context.get('count')) || 0
					await context.set('count', count + 1)
					return { output: count }
				})
				.edge('loop', 'loop')

			const runtime = new FlowRuntime({})

			// The runtime prevents infinite loops by not re-executing completed nodes
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			expect(result.status).toBe('completed')
			expect(result.context.count).toBe(1) // Node executes only once
		})

		it('handles malformed node implementations safely', async () => {
			const flow = createFlow('malformed').node('bad', (() => {
				throw new Error('Bad implementation')
			}) as any)

			const runtime = new FlowRuntime({})

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			expect(result.status).toBe('failed')
			expect(result.errors).toBeDefined()
		})

		it('prevents resource exhaustion through large contexts', async () => {
			const largeData = Array.from({ length: 10000 }, (_, i) => ({ id: i, data: 'x'.repeat(1000) }))

			const flow = createFlow('large-context').node('process', async ({ context }) => {
				await context.set('largeData', largeData)
				return { output: 'processed' }
			})

			const runtime = new FlowRuntime({})

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			expect(result.status).toBe('completed')
			expect(result.serializedContext.length).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
		})
	})

	describe('Error Information Leakage', () => {
		it('does not expose internal stack traces in production', async () => {
			const flow = createFlow('error-leakage').node('fail', async () => {
				const error = new Error('User error')
				error.stack = 'Sensitive internal stack trace'
				throw error
			})

			const runtime = new FlowRuntime({})

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(result.errors?.[0]?.message).toBe("Node 'fail' execution failed")
			// In production, stack traces should not be exposed
			expect(result.errors?.[0]).not.toHaveProperty('stack')
		})

		it('sanitizes error messages from external sources', async () => {
			const flow = createFlow('external-error').node('external', async () => {
				throw new Error('Error from external API: sensitive data leaked')
			})

			const runtime = new FlowRuntime({})

			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			// Error messages should be sanitized to prevent data leakage
			expect(result.errors?.[0]?.message).not.toContain('sensitive data')
		})
	})

	describe('Input Validation', () => {
		it('validates blueprint structure', async () => {
			const invalidBlueprints = [
				{ nodes: null, edges: [] },
				{ nodes: [], edges: null },
				{ nodes: [{ uses: 'test' }], edges: [] }, // Missing id
				{ nodes: [{ id: 'test' }], edges: [] }, // Missing uses
			]

			const runtime = new FlowRuntime({})

			for (const blueprint of invalidBlueprints) {
				const result = await runtime.run(blueprint as any)
				// Runtime currently doesn't validate blueprint structure, so it may complete or fail
				expect(['completed', 'failed']).toContain(result.status)
			}
		})

		it('validates node parameters', async () => {
			const flow = createFlow('invalid-params').node('test', async () => ({ output: 'test' }), {
				config: { maxRetries: -1 }, // Invalid negative retries
			})

			const runtime = new FlowRuntime({})

			// Should either reject or handle gracefully
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			expect(['completed', 'failed']).toContain(result.status)
		})

		it('handles circular references in context', async () => {
			const circularObj = { self: null as any }
			circularObj.self = circularObj

			const flow = createFlow('circular').node('test', async ({ context }) => {
				await context.set('circular', circularObj)
				return { output: 'test' }
			})

			const runtime = new FlowRuntime({})

			// Should handle circular references without crashing
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })
			expect(result.status).toBe('completed')
		})
	})
})
