import { describe, expect, it, vi } from 'vitest'
import { FlowcraftError } from '../../src/errors'
import { ClassNodeExecutor, FunctionNodeExecutor } from '../../src/runtime/executors'

describe('FunctionNodeExecutor', () => {
	it('should execute function nodes successfully', async () => {
		const mockFunction = vi.fn().mockResolvedValue({ output: 'success' })
		const executor = new FunctionNodeExecutor(mockFunction, 1, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn() } },
			signal: undefined,
		} as any
		const result = await executor.execute(nodeDef, context)
		expect(result.output).toBe('success')
		expect(mockFunction).toHaveBeenCalledWith(context)
	})

	it('should handle retries on failure', async () => {
		const mockFunction = vi.fn().mockRejectedValueOnce(new Error('Fail')).mockResolvedValueOnce({ output: 'success' })
		const executor = new FunctionNodeExecutor(mockFunction, 2, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn(), warn: vi.fn() } },
			signal: undefined,
		} as any
		const result = await executor.execute(nodeDef, context)
		expect(result.output).toBe('success')
		expect(mockFunction).toHaveBeenCalledTimes(2)
	})

	it('should throw on abort signal', async () => {
		const controller = new AbortController()
		controller.abort()
		const mockFunction = vi.fn().mockResolvedValue({ output: 'success' })
		const executor = new FunctionNodeExecutor(mockFunction, 1, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn() } },
			signal: controller.signal,
		} as any
		await expect(executor.execute(nodeDef, context, undefined, controller.signal)).rejects.toThrow('Workflow cancelled')
	})

	it('should stop on fatal errors', async () => {
		const mockFunction = vi.fn().mockRejectedValue(
			new FlowcraftError('Fatal', {
				nodeId: 'test',
				blueprintId: '',
				isFatal: true,
			}),
		)
		const executor = new FunctionNodeExecutor(mockFunction, 3, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn(), error: vi.fn() } },
			signal: undefined,
		} as any
		await expect(executor.execute(nodeDef, context)).rejects.toThrow('Fatal')
		expect(mockFunction).toHaveBeenCalledTimes(1)
	})
})

describe('ClassNodeExecutor', () => {
	it('should execute class nodes successfully', async () => {
		// Simplified test without extending BaseNode due to type complexity
		const mockImplementation = class {
			prep: any
			exec: any
			post: any
			constructor(_params: any, _nodeId: string) {
				this.prep = vi.fn().mockResolvedValue(null)
				this.exec = vi.fn().mockResolvedValue({ output: 'success' })
				this.post = vi.fn().mockResolvedValue({ output: 'success' })
			}
		}
		const executor = new ClassNodeExecutor(mockImplementation as any, 1, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn() } },
			signal: undefined,
		} as any
		const result = await executor.execute(nodeDef, context)
		expect(result.output).toBe('success')
	})

	it('should handle retries on failure', async () => {
		let attempts = 0
		const mockImplementation = class {
			prep: any
			exec: any
			post: any
			constructor(_params: any, _nodeId: string) {
				this.prep = vi.fn().mockResolvedValue(null)
				this.exec = vi.fn().mockImplementation(() => {
					attempts++
					if (attempts < 2) throw new Error('Fail')
					return { output: 'success' }
				})
				this.post = vi.fn().mockResolvedValue({ output: 'success' })
			}
		}
		const executor = new ClassNodeExecutor(mockImplementation as any, 2, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn(), warn: vi.fn() } },
			signal: undefined,
		} as any
		const result = await executor.execute(nodeDef, context)
		expect(result.output).toBe('success')
		expect(attempts).toBe(2)
	})

	it('should execute fallback on error', async () => {
		const mockImplementation = class {
			prep: any
			exec: any
			fallback: any
			post: any
			constructor(_params: any, _nodeId: string) {
				this.prep = vi.fn().mockResolvedValue(null)
				this.exec = vi.fn().mockRejectedValue(new Error('Fail'))
				this.fallback = vi.fn().mockResolvedValue({ output: 'fallback' })
				this.post = vi.fn().mockResolvedValue({ output: 'fallback', _fallbackExecuted: true })
			}
		}
		const executor = new ClassNodeExecutor(mockImplementation as any, 1, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: {
				logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			},
			signal: undefined,
		} as any
		const result = await executor.execute(nodeDef, context)
		expect(result.output).toBe('fallback')
		expect(result._fallbackExecuted).toBe(true)
	})

	it('should throw on abort signal', async () => {
		const controller = new AbortController()
		controller.abort()
		const mockImplementation = class {
			prep: any
			exec: any
			post: any
			constructor(_params: any, _nodeId: string) {
				this.prep = vi.fn().mockResolvedValue(null)
				this.exec = vi.fn().mockResolvedValue({ output: 'success' })
				this.post = vi.fn().mockResolvedValue({ output: 'success' })
			}
		}
		const executor = new ClassNodeExecutor(mockImplementation as any, 1, {
			emit: vi.fn(),
		})
		const nodeDef = { id: 'test', uses: 'test', params: {} }
		const context = {
			context: {
				get: vi.fn(),
				set: vi.fn(),
				type: 'sync',
				has: vi.fn(),
				delete: vi.fn(),
				toJSON: vi.fn(),
			},
			input: 'input',
			params: {},
			dependencies: { logger: { info: vi.fn(), warn: vi.fn() } },
			signal: controller.signal,
		} as any
		await expect(executor.execute(nodeDef, context, undefined, controller.signal)).rejects.toThrow('Workflow cancelled')
	})
})
