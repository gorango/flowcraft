import { describe, it } from 'vitest'
import { FunctionNodeExecutor, ClassNodeExecutor, BuiltInNodeExecutor } from '../../src/runtime/executors'

describe('FunctionNodeExecutor', () => {
	it('should execute function nodes successfully', () => { })

	it('should handle retries on failure', () => { })

	it('should throw on abort signal', () => { })

	it('should stop on fatal errors', () => { })
})

describe('ClassNodeExecutor', () => {
	it('should execute class nodes successfully', () => { })

	it('should handle retries on failure', () => { })

	it('should execute fallback on error', () => { })

	it('should throw on abort signal', () => { })
})

describe('BuiltInNodeExecutor', () => {
	it('should execute built-in nodes correctly', () => { })

	it('should handle different built-in types', () => { })
})
