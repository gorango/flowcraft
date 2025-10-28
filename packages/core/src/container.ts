export type ServiceToken<_T = any> = string | symbol

export class DIContainer {
	private services: Map<ServiceToken, any> = new Map()
	private factories: Map<ServiceToken, (container: DIContainer) => any> = new Map()

	register<T>(token: ServiceToken<T>, implementation: T): void {
		this.services.set(token, implementation)
	}

	registerFactory<T>(token: ServiceToken<T>, factory: (container: DIContainer) => T): void {
		this.factories.set(token, factory)
	}

	resolve<T>(token: ServiceToken<T>): T {
		if (this.services.has(token)) {
			return this.services.get(token)
		}

		if (this.factories.has(token)) {
			const factory = this.factories.get(token)
			const instance = factory?.(this)
			this.services.set(token, instance)
			return instance
		}

		throw new Error(`Service not found for token: ${String(token)}`)
	}

	has(token: ServiceToken): boolean {
		return this.services.has(token) || this.factories.has(token)
	}

	createChild(): DIContainer {
		const child = new DIContainer()
		child.services = new Map(this.services)
		child.factories = new Map(this.factories)
		return child
	}
}

export const ServiceTokens = {
	Logger: Symbol.for('flowcraft:logger'),
	Serializer: Symbol.for('flowcraft:serializer'),
	Evaluator: Symbol.for('flowcraft:evaluator'),
	EventBus: Symbol.for('flowcraft:eventBus'),
	Orchestrator: Symbol.for('flowcraft:orchestrator'),
	Middleware: Symbol.for('flowcraft:middleware'),
	NodeRegistry: Symbol.for('flowcraft:nodeRegistry'),
	BlueprintRegistry: Symbol.for('flowcraft:blueprintRegistry'),
	Dependencies: Symbol.for('flowcraft:dependencies'),
} as const
