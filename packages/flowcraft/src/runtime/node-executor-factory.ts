import { FlowcraftError } from '../errors'
import { isNodeClass } from '../node'
import type { IEventBus, NodeClass, NodeDefinition, NodeFunction } from '../types'
import type { ExecutionContext } from './execution-context'
import type { ExecutionStrategy } from './executors'
import { ClassNodeExecutor, FunctionNodeExecutor, NodeExecutor } from './executors'

export class NodeExecutorFactory {
	constructor(private readonly eventBus: IEventBus) {}

	public createExecutorForNode(nodeId: string, context: ExecutionContext<any, any>): NodeExecutor<any, any> {
		const nodeDef = context.blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: context.blueprint.id,
				executionId: context.executionId,
				isFatal: false,
			})
		}

		const strategy = this.getExecutionStrategy(nodeDef, context.nodeRegistry)

		return new NodeExecutor({ context, nodeDef, strategy })
	}

	private getExecutionStrategy(
		nodeDef: NodeDefinition,
		nodeRegistry: Map<string, NodeFunction | NodeClass>,
	): ExecutionStrategy {
		const implementation = nodeRegistry.get(nodeDef.uses)
		if (!implementation) {
			throw new FlowcraftError(`Implementation for '${nodeDef.uses}' not found.`, {
				nodeId: nodeDef.id,
				blueprintId: '',
				isFatal: true,
			})
		}

		const maxRetries = nodeDef.config?.maxRetries ?? 1
		return isNodeClass(implementation)
			? new ClassNodeExecutor(implementation, maxRetries, this.eventBus)
			: new FunctionNodeExecutor(implementation, maxRetries, this.eventBus)
	}
}
