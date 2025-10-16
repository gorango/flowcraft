import { describe, expect, it, vi } from 'vitest'
import { OpenTelemetryMiddleware } from '../src/middleware'

vi.mock('../src/propagator', () => ({
	extractContext: vi.fn().mockResolvedValue({}),
	injectContext: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@opentelemetry/api', () => ({
	trace: {
		getTracer: vi.fn(() => ({
			startSpan: vi.fn(() => ({
				setAttributes: vi.fn(),
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			})),
		})),
		setSpan: vi.fn(),
	},
	context: {
		with: vi.fn((_ctx, fn) => fn()),
		active: vi.fn(),
	},
	SpanStatusCode: {
		OK: 'OK',
		ERROR: 'ERROR',
	},
}))

describe('OpenTelemetryMiddleware', () => {
	it('should create a middleware instance', () => {
		const middleware = new OpenTelemetryMiddleware('test-tracer')
		expect(middleware).toBeInstanceOf(OpenTelemetryMiddleware)
	})

	it('should handle node execution', async () => {
		const middleware = new OpenTelemetryMiddleware('test-tracer')
		const mockCtx = {
			get: vi.fn().mockResolvedValue('test-value'),
		}
		const mockNext = vi.fn().mockResolvedValue({ success: true })

		const result = await middleware.aroundNode(mockCtx as any, 'node1', mockNext)
		expect(result).toEqual({ success: true })
	})
})
