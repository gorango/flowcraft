import { DIContainer, ServiceTokens } from './container'
import { PropertyEvaluator } from './evaluator'
import { NullLogger } from './logger'
import { RunToCompletionOrchestrator } from './runtime/orchestrator'
import { JsonSerializer } from './serializer'
import type {
	IEvaluator,
	IEventBus,
	ILogger,
	ISerializer,
	Middleware,
	NodeClass,
	NodeFunction,
	RuntimeDependencies,
	WorkflowBlueprint,
} from './types'

export interface ContainerOptions<TDependencies extends RuntimeDependencies = RuntimeDependencies> {
	logger?: ILogger
	serializer?: ISerializer
	evaluator?: IEvaluator
	eventBus?: IEventBus
	middleware?: Middleware[]
	registry?: Record<string, NodeFunction | NodeClass>
	blueprints?: Record<string, WorkflowBlueprint>
	dependencies?: TDependencies
}

export function createDefaultContainer<TDependencies extends RuntimeDependencies = RuntimeDependencies>(
	options: ContainerOptions<TDependencies> = {},
): DIContainer {
	const container = new DIContainer()

	container.register(ServiceTokens.Logger, options.logger || new NullLogger())
	container.register(ServiceTokens.Serializer, options.serializer || new JsonSerializer())
	container.register(ServiceTokens.Evaluator, options.evaluator || new PropertyEvaluator())
	container.register(ServiceTokens.EventBus, options.eventBus || { emit: async () => {} })
	container.register(ServiceTokens.Middleware, options.middleware || [])
	container.register(ServiceTokens.NodeRegistry, options.registry || {})
	container.register(ServiceTokens.BlueprintRegistry, options.blueprints || {})
	container.register(ServiceTokens.Dependencies, options.dependencies || ({} as TDependencies))

	container.registerFactory(ServiceTokens.Orchestrator, () => new RunToCompletionOrchestrator())

	return container
}
