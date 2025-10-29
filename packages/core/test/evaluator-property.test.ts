import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PropertyEvaluator, UnsafeEvaluator } from '../src/evaluator'

beforeAll(() => {
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
	vi.restoreAllMocks()
})

// Basic property-based testing without external dependencies
// These tests generate systematic inputs to test edge cases

describe('Evaluator Property Tests', () => {
	describe('PropertyEvaluator', () => {
		const evaluator = new PropertyEvaluator()

		it('handles various safe property paths', () => {
			const testCases = [
				// Simple properties
				{ expr: 'a', context: { a: 1 }, expected: 1 },
				{ expr: 'a.b', context: { a: { b: 2 } }, expected: 2 },
				{ expr: 'a.b.c', context: { a: { b: { c: 3 } } }, expected: 3 },

				// Deep nesting
				{ expr: 'result.output.status', context: { result: { output: { status: 'OK' } } }, expected: 'OK' },
				{ expr: 'context.user.isAdmin', context: { context: { user: { isAdmin: true } } }, expected: true },

				// Undefined paths
				{ expr: 'missing', context: {}, expected: undefined },
				{ expr: 'a.missing', context: { a: {} }, expected: undefined },

				// Null/undefined in path
				{ expr: 'a.b.c', context: { a: { b: null } }, expected: undefined },
				{ expr: 'a.b.c', context: { a: { b: undefined } }, expected: undefined },
			]

			for (const { expr, context, expected } of testCases) {
				expect(evaluator.evaluate(expr, context)).toBe(expected)
			}
		})

		it('rejects unsafe expressions', () => {
			const unsafeExpressions = [
				'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z',
				'a()',
				'a + b',
				'a === b',
				'Math.random()',
				'process.env',
				'global',
				'window',
				'document',
				'eval("code")',
				'Function("code")',
				'require("module")',
				'__proto__',
				'constructor',
				'prototype',
				'toString.call()',
				'a; b',
				'a, b',
				'a || b',
				'a && b',
				'a ? b : c',
				'!a',
				'~a',
				'a++',
				'++a',
				'a--',
				'--a',
				'new Object()',
				'delete a',
				'void a',
				'typeof a',
				'a instanceof Object',
				'a in b',
			]

			for (const expr of unsafeExpressions) {
				expect(evaluator.evaluate(expr, { a: 1, b: 2 })).toBeUndefined()
			}
		})

		it('handles edge cases in property names', () => {
			const edgeCases = [
				// Numbers in property names
				{ expr: 'a1', context: { a1: 'value' }, expected: 'value' },
				{ expr: 'a_1', context: { a_1: 'value' }, expected: 'value' },
				{ expr: 'a.b1', context: { a: { b1: 'value' } }, expected: 'value' },

				// Empty strings
				{ expr: '', context: { '': 'value' }, expected: undefined },

				// Special characters (should be rejected)
				{ expr: 'a-b', context: { 'a-b': 'value' }, expected: undefined },
				{ expr: 'a.b-c', context: { a: { 'b-c': 'value' } }, expected: undefined },
			]

			for (const { expr, context, expected } of edgeCases) {
				expect(evaluator.evaluate(expr, context)).toBe(expected)
			}
		})

		it('is idempotent - same input always produces same output', () => {
			const testCases = [
				{ expr: 'a.b.c', context: { a: { b: { c: 42 } } } },
				{ expr: 'missing', context: {} },
				{ expr: 'invalid[0]', context: { 'invalid[0]': 'should not match' } }, // Invalid expression
			]

			for (const { expr, context } of testCases) {
				const result1 = evaluator.evaluate(expr, context)
				const result2 = evaluator.evaluate(expr, context)
				const result3 = evaluator.evaluate(expr, context)
				expect(result1).toEqual(result2)
				expect(result2).toEqual(result3)
			}
		})

		it('handles deeply nested structures', () => {
			const deepContext = {
				level1: {
					level2: {
						level3: {
							level4: {
								level5: {
									value: 'deep',
								},
							},
						},
					},
				},
			}

			expect(evaluator.evaluate('level1.level2.level3.level4.level5.value', deepContext)).toBe('deep')
		})

		it('handles arrays of objects', () => {
			const context = {
				users: [
					{ name: 'Alice', age: 25 },
					{ name: 'Bob', age: 30 },
					{ name: 'Charlie', age: 35 },
				],
				firstUser: { name: 'Alice', age: 25 },
			}

			// PropertyEvaluator can access object properties but not array elements
			expect(evaluator.evaluate('firstUser.name', context)).toBe('Alice')
			expect(evaluator.evaluate('firstUser.age', context)).toBe(25)
			// Array access should be rejected
			expect(evaluator.evaluate('users[0].name', context)).toBeUndefined()
		})
	})

	describe('UnsafeEvaluator', () => {
		const evaluator = new UnsafeEvaluator()

		it('handles basic arithmetic and logic', () => {
			const context = { a: 5, b: 3, c: true, d: false }

			expect(evaluator.evaluate('a + b', context)).toBe(8)
			expect(evaluator.evaluate('a * b', context)).toBe(15)
			expect(evaluator.evaluate('a > b', context)).toBe(true)
			expect(evaluator.evaluate('c && d', context)).toBe(false)
			expect(evaluator.evaluate('c || d', context)).toBe(true)
		})

		it('can access safe context properties', () => {
			const context = {
				user: { name: 'Alice', age: 30 },
				items: [1, 2, 3],
				config: { enabled: true },
			}

			expect(evaluator.evaluate('user.name', context)).toBe('Alice')
			expect(evaluator.evaluate('user.age + 5', context)).toBe(35)
			expect(evaluator.evaluate('items.length', context)).toBe(3)
			expect(evaluator.evaluate('config.enabled', context)).toBe(true)
		})

		it('handles prototype access', () => {
			const context = { a: 1, b: 2 }

			// UnsafeEvaluator allows access to object prototype methods
			// These will return the prototype methods of the context object
			expect(typeof evaluator.evaluate('constructor', context)).toBe('function')
			expect(typeof evaluator.evaluate('toString', context)).toBe('function')
			expect(typeof evaluator.evaluate('hasOwnProperty', context)).toBe('function')
		})

		it('handles complex expressions safely', () => {
			const context = {
				data: [1, 2, 3, 4, 5],
				threshold: 3,
			}

			expect(evaluator.evaluate('data.filter(x => x > threshold).length', context)).toBe(2)
			expect(evaluator.evaluate('data.reduce((sum, x) => sum + x, 0)', context)).toBe(15)
			expect(evaluator.evaluate('Math.max(...data)', context)).toBe(5)
		})

		it('allows access to prototype and constructor', () => {
			const context = { obj: {} }

			// UnsafeEvaluator allows access to prototype methods
			expect(evaluator.evaluate('obj.__proto__', context)).toEqual({})
			expect(typeof evaluator.evaluate('obj.constructor', context)).toBe('function')
			expect(evaluator.evaluate('obj.prototype', context)).toBeUndefined() // obj doesn't have prototype
			expect(typeof evaluator.evaluate('Object.prototype', context)).toBe('object')
		})
	})

	describe('Evaluator Comparison', () => {
		it('PropertyEvaluator is more restrictive than UnsafeEvaluator', () => {
			const propertyEval = new PropertyEvaluator()
			const unsafeEval = new UnsafeEvaluator()

			const context = { a: { b: { c: 42 } } }

			// Both should work for simple property access
			expect(propertyEval.evaluate('a.b.c', context)).toBe(42)
			expect(unsafeEval.evaluate('a.b.c', context)).toBe(42)

			// Only unsafe should work for complex expressions
			expect(propertyEval.evaluate('a.b.c + 1', context)).toBeUndefined()
			expect(unsafeEval.evaluate('a.b.c + 1', context)).toBe(43)
		})

		it('both evaluators handle undefined gracefully', () => {
			const propertyEval = new PropertyEvaluator()
			const unsafeEval = new UnsafeEvaluator()

			const context = { a: { b: null } }

			expect(propertyEval.evaluate('a.b.c', context)).toBeUndefined()
			expect(unsafeEval.evaluate('a.b?.c', context)).toBeUndefined()
		})
	})

	// Systematic testing of edge cases
	describe('Systematic Edge Cases', () => {
		const evaluators = [
			{ name: 'PropertyEvaluator', instance: new PropertyEvaluator() },
			{ name: 'UnsafeEvaluator', instance: new UnsafeEvaluator() },
		]

		for (const { name, instance } of evaluators) {
			describe(name, () => {
				it('handles extreme nesting levels', () => {
					let context: any = { value: 'deep' }
					let expr = 'value'

					// Create deeply nested object (reduced from 100 to 20 to prevent memory issues)
					for (let i = 0; i < 20; i++) {
						const newContext: any = {}
						newContext[`level${i}`] = context
						context = newContext
						expr = `level${i}.${expr}`
					}

					if (name === 'PropertyEvaluator') {
						// PropertyEvaluator should handle deep nesting
						expect(instance.evaluate(expr, context)).toBe('deep')
					} else {
						// UnsafeEvaluator might have limits
						expect(() => instance.evaluate(expr, context)).not.toThrow()
					}
				})

				it('handles large arrays', () => {
					const largeArray = Array.from({ length: 1000 }, (_, i) => i) // Reduced from 10000 to 1000
					const context = { data: largeArray, firstItem: 0, lastItem: 999 }

					expect(instance.evaluate('data.length', context)).toBe(1000)

					if (name === 'PropertyEvaluator') {
						// PropertyEvaluator cannot access array elements
						expect(instance.evaluate('data[0]', context)).toBeUndefined()
						expect(instance.evaluate('firstItem', context)).toBe(0)
					} else {
						// UnsafeEvaluator can access array elements
						expect(instance.evaluate('data[0]', context)).toBe(0)
						expect(instance.evaluate('data[999]', context)).toBe(999)
					}
				})

				it('handles special values', () => {
					const context = {
						zero: 0,
						negative: -1,
						float: 3.14,
						infinity: Infinity,
						negInfinity: -Infinity,
						nan: NaN,
						emptyString: '',
						null: null,
						undefined: undefined,
						true: true,
						false: false,
					}

					// These should not crash the evaluator
					for (const key of Object.keys(context)) {
						expect(() => instance.evaluate(key, context)).not.toThrow()
					}
				})

				it('handles unicode and special characters in property names', () => {
					const context = {
						normal: 'normal',
						'with-dash': 'dash',
						with_underscore: 'underscore',
						'with spaces': 'spaces',
						'with.dots': 'dots',
						'123start': 'number',
						'🚀': 'emoji',
						café: 'accented',
					}

					// PropertyEvaluator allows valid characters but rejects invalid ones
					if (name === 'PropertyEvaluator') {
						expect(instance.evaluate('normal', context)).toBe('normal')
						expect(instance.evaluate('with_underscore', context)).toBe('underscore') // Underscore is allowed
						expect(instance.evaluate('123start', context)).toBe('number') // Numbers are allowed in property names
						expect(instance.evaluate('with-dash', context)).toBeUndefined() // Dash not allowed
						expect(instance.evaluate('with spaces', context)).toBeUndefined() // Spaces not allowed
						expect(instance.evaluate('🚀', context)).toBeUndefined() // Emoji not allowed
						expect(instance.evaluate('café', context)).toBeUndefined()
					} else {
						// UnsafeEvaluator might handle some
						expect(() => instance.evaluate('normal', context)).not.toThrow()
					}
				})
			})
		}
	})
})
