import { describe, expect, it, vi } from 'vitest'
import { DIContainer, ServiceTokens } from '../src/container'
import { createDefaultContainer } from '../src/container-factory'
import { PropertyEvaluator } from '../src/evaluator'
import { NullLogger } from '../src/logger'
import { DefaultOrchestrator } from '../src/runtime/orchestrator'
import { JsonSerializer } from '../src/serializer'

describe('createDefaultContainer', () => {
	it('should return a DIContainer instance', () => {
		const container = createDefaultContainer()
		expect(container).toBeInstanceOf(DIContainer)
	})

	it('should register default services when no options provided', () => {
		const container = createDefaultContainer()

		expect(container.resolve(ServiceTokens.Logger)).toBeInstanceOf(NullLogger)
		expect(container.resolve(ServiceTokens.Serializer)).toBeInstanceOf(JsonSerializer)
		expect(container.resolve(ServiceTokens.Evaluator)).toBeInstanceOf(PropertyEvaluator)
		expect(container.resolve(ServiceTokens.EventBus)).toEqual({ emit: expect.any(Function) })
		expect(container.resolve(ServiceTokens.Middleware)).toEqual([])
		expect(container.resolve(ServiceTokens.NodeRegistry)).toEqual({})
		expect(container.resolve(ServiceTokens.BlueprintRegistry)).toEqual({})
		expect(container.resolve(ServiceTokens.Dependencies)).toEqual({})
	})

	it('should register Orchestrator factory that creates DefaultOrchestrator', () => {
		const container = createDefaultContainer()
		const orchestrator = container.resolve(ServiceTokens.Orchestrator)
		expect(orchestrator).toBeInstanceOf(DefaultOrchestrator)
	})

	it('should use custom options when provided', () => {
		const customLogger = new NullLogger()
		const customSerializer = new JsonSerializer()
		const customEvaluator = new PropertyEvaluator()
		const customEventBus = { emit: async () => {} }
		const customMiddleware = [{ beforeNode: vi.fn() }]
		const customRegistry = { test: vi.fn().mockResolvedValue({ output: 'test' }) }
		const customBlueprints = { test: { id: 'test', nodes: [], edges: [] } }
		const customDependencies = { test: 'value' }

		const container = createDefaultContainer({
			logger: customLogger,
			serializer: customSerializer,
			evaluator: customEvaluator,
			eventBus: customEventBus,
			middleware: customMiddleware,
			registry: customRegistry,
			blueprints: customBlueprints,
			dependencies: customDependencies,
		})

		expect(container.resolve(ServiceTokens.Logger)).toBe(customLogger)
		expect(container.resolve(ServiceTokens.Serializer)).toBe(customSerializer)
		expect(container.resolve(ServiceTokens.Evaluator)).toBe(customEvaluator)
		expect(container.resolve(ServiceTokens.EventBus)).toBe(customEventBus)
		expect(container.resolve(ServiceTokens.Middleware)).toBe(customMiddleware)
		expect(container.resolve(ServiceTokens.NodeRegistry)).toBe(customRegistry)
		expect(container.resolve(ServiceTokens.BlueprintRegistry)).toBe(customBlueprints)
		expect(container.resolve(ServiceTokens.Dependencies)).toBe(customDependencies)
	})

	it('should allow resolving all registered services', () => {
		const container = createDefaultContainer()

		// Should not throw for any service token
		expect(() => container.resolve(ServiceTokens.Logger)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.Serializer)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.Evaluator)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.EventBus)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.Middleware)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.NodeRegistry)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.BlueprintRegistry)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.Dependencies)).not.toThrow()
		expect(() => container.resolve(ServiceTokens.Orchestrator)).not.toThrow()
	})
})
