import type { IContext, IOrchestrator } from './types'

/**
 * Default orchestrator that implements the standard frontier-based execution strategy.
 */
export class DefaultOrchestrator implements IOrchestrator {
	async orchestrate(flow: any, context: any): Promise<any> {
		return flow.execute(context)
	}
}

/**
 * Interface for executable flows that can be orchestrated.
 */
export interface OrchestratableFlow<TContext extends Record<string, any> = Record<string, any>> {
	execute: (context: IContext<TContext>) => Promise<IContext<TContext>>
}
