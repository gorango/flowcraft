import { describe, expect, it } from 'vitest'
import { PropertyEvaluator, UnsafeEvaluator } from '../src/evaluator'

describe('PropertyEvaluator', () => {
	it('should correctly access top-level properties', () => {
		const evaluator = new PropertyEvaluator()
		const context = { name: 'test', value: 42 }
		expect(evaluator.evaluate('name', context)).toBe('test')
		expect(evaluator.evaluate('value', context)).toBe(42)
	})

	it('should correctly access nested properties', () => {
		const evaluator = new PropertyEvaluator()
		const context = { result: { output: { status: 'OK' } } }
		expect(evaluator.evaluate('result.output.status', context)).toBe('OK')
	})

	it('should return undefined for non-existent paths', () => {
		const evaluator = new PropertyEvaluator()
		const context = { name: 'test' }
		expect(evaluator.evaluate('nonexistent', context)).toBeUndefined()
		expect(evaluator.evaluate('name.nonexistent', context)).toBeUndefined()
	})

	it('should return undefined for paths that go through null or undefined', () => {
		const evaluator = new PropertyEvaluator()
		const context = { result: { output: null } }
		expect(evaluator.evaluate('result.output.status', context)).toBeUndefined()
	})

	it('should reject expressions with invalid characters', () => {
		const evaluator = new PropertyEvaluator()
		const context = { name: 'test' }
		expect(evaluator.evaluate('name + 1', context)).toBeUndefined()
		expect(evaluator.evaluate('name === "test"', context)).toBeUndefined()
		expect(evaluator.evaluate('Math.sqrt(name)', context)).toBeUndefined()
	})

	it('should handle empty expressions', () => {
		const evaluator = new PropertyEvaluator()
		const context = { name: 'test' }
		expect(evaluator.evaluate('', context)).toBeUndefined()
	})

	it('should handle expressions with only dots', () => {
		const evaluator = new PropertyEvaluator()
		const context = { name: 'test' }
		expect(evaluator.evaluate('...', context)).toBeUndefined()
	})
})

describe('UnsafeEvaluator', () => {
	it('should evaluate complex expressions', () => {
		const evaluator = new UnsafeEvaluator()
		const context = { input: 5 }
		expect(evaluator.evaluate('input * 2', context)).toBe(10)
	})

	it('should evaluate conditions', () => {
		const evaluator = new UnsafeEvaluator()
		const context = { result: { output: { status: 'OK' } } }
		expect(evaluator.evaluate("result.output.status === 'OK'", context)).toBe(true)
	})

	it('should handle errors gracefully', () => {
		const evaluator = new UnsafeEvaluator()
		const context = { name: 'test' }
		expect(evaluator.evaluate('undefinedVariable', context)).toBeUndefined()
	})
})
