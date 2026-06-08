import { describe, expect, it, vi } from 'vitest'
import { propagation } from '@opentelemetry/api'
import { extractContext, injectContext } from '../src/propagator'

vi.mock('@opentelemetry/api', () => ({
	context: {
		active: vi.fn(),
	},
	propagation: {
		inject: vi.fn(),
		extract: vi.fn().mockReturnValue({}),
	},
	trace: {
		setSpan: vi.fn(),
		active: vi.fn(),
	},
}))

describe('OpenTelemetry Propagator', () => {
	it('should inject context into async flow context', async () => {
		const mockFlowContext = {
			type: 'async',
			get: vi.fn(),
			set: vi.fn(),
		}
		const mockSpan = { spanContext: vi.fn() }

		await injectContext(mockFlowContext as any, mockSpan as any, ['node1', 'node2'])
		expect(mockFlowContext.set).toHaveBeenCalledTimes(2)
	})

	it('should inject context into sync flow context', async () => {
		const mockFlowContext = {
			type: 'sync',
			get: vi.fn(),
			set: vi.fn(),
		}
		const mockSpan = { spanContext: vi.fn() }

		await injectContext(mockFlowContext as any, mockSpan as any, ['node1'])
		expect(mockFlowContext.set).toHaveBeenCalledTimes(1)
	})

	it('should extract context from async flow context', async () => {
		const carrier = { traceparent: '00-abc-def' }
		const mockFlowContext = {
			type: 'async',
			get: vi.fn().mockResolvedValue(carrier),
			delete: vi.fn(),
		}
		const mockContext = {}
		;(propagation.extract as any).mockResolvedValue(mockContext)

		await extractContext(mockFlowContext as any, 'node1')
		expect(mockFlowContext.delete).toHaveBeenCalled()
	})

	it('should extract context from sync flow context', async () => {
		const carrier = { traceparent: '00-xyz-789' }
		const mockFlowContext = {
			type: 'sync',
			get: vi.fn().mockResolvedValue(carrier),
			delete: vi.fn(),
		}

		await extractContext(mockFlowContext as any, 'node1')
		expect(mockFlowContext.delete).toHaveBeenCalled()
	})

	it('should handle missing carrier gracefully', async () => {
		const mockFlowContext = {
			type: 'async',
			get: vi.fn().mockResolvedValue(null),
			delete: vi.fn(),
		}

		await extractContext(mockFlowContext as any, 'node1')
		expect(mockFlowContext.delete).toHaveBeenCalled()
	})
})
