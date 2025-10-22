import { AsyncContextView } from '../context'
import { FlowcraftError } from '../errors'
import type {
	ContextImplementation,
	EdgeDefinition,
	IEvaluator,
	IEventBus,
	NodeDefinition,
	NodeResult,
	WorkflowBlueprint,
} from '../types'

export class WorkflowLogicHandler {
	constructor(
		private readonly evaluator: IEvaluator,
		private readonly eventBus: IEventBus,
	) {}

	public async determineNextNodes(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<any>,
		executionId?: string,
	): Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]> {
		const outgoingEdges = blueprint.edges.filter((edge) => edge.source === nodeId)
		const matched: { node: NodeDefinition; edge: EdgeDefinition }[] = []
		const evaluateEdge = async (edge: EdgeDefinition): Promise<boolean> => {
			if (!edge.condition) return true
			const contextData = context.type === 'sync' ? context.toJSON() : await context.toJSON()
			const evaluationResult = !!this.evaluator.evaluate(edge.condition, {
				...contextData,
				result,
			})
			await this.eventBus.emit({
				type: 'edge:evaluate',
				payload: { source: nodeId, target: edge.target, condition: edge.condition, result: evaluationResult },
			})
			return evaluationResult
		}
		if (result.action) {
			const actionEdges = outgoingEdges.filter((edge) => edge.action === result.action)
			for (const edge of actionEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				} else {
					await this.eventBus.emit({
						type: 'node:skipped',
						payload: { nodeId, edge, executionId: executionId || '', blueprintId: blueprint.id },
					})
				}
			}
		}
		if (matched.length === 0) {
			const defaultEdges = outgoingEdges.filter((edge) => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				} else {
					await this.eventBus.emit({
						type: 'node:skipped',
						payload: { nodeId, edge, executionId: executionId || '', blueprintId: blueprint.id },
					})
				}
			}
		}
		return matched
	}

	public async applyEdgeTransform(
		edge: EdgeDefinition,
		sourceResult: NodeResult<any, any>,
		targetNode: NodeDefinition,
		context: ContextImplementation<any>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<void> {
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		const predecessors = allPredecessors?.get(targetNode.id)
		const hasSinglePredecessor = predecessors && predecessors.size === 1
		const hasExplicitInputs = targetNode.inputs !== undefined
		const hasEdgeTransform = edge.transform !== undefined
		if (!hasExplicitInputs && !hasSinglePredecessor && !hasEdgeTransform) {
			return
		}
		const finalInput = edge.transform
			? this.evaluator.evaluate(edge.transform, {
					input: sourceResult.output,
					context: await asyncContext.toJSON(),
				})
			: sourceResult.output
		const inputKey = `_inputs.${targetNode.id}`
		await asyncContext.set(inputKey as any, finalInput)
		await this.eventBus.emit({
			type: 'context:change',
			payload: { sourceNode: edge.source, key: inputKey, value: finalInput },
		})
		if (!hasExplicitInputs) {
			targetNode.inputs = inputKey
		}
	}

	public async resolveNodeInput(
		nodeId: string,
		blueprint: WorkflowBlueprint,
		context: ContextImplementation<any>,
	): Promise<any> {
		const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: blueprint.id,
				isFatal: false,
			})
		}
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		if (nodeDef.inputs) {
			if (typeof nodeDef.inputs === 'string') {
				const key = nodeDef.inputs
				if (key.startsWith('_')) return await asyncContext.get(key as any)
				const outputKey = `_outputs.${key}`
				if (await asyncContext.has(outputKey as any)) {
					return await asyncContext.get(outputKey as any)
				}
				return await asyncContext.get(key as any)
			}
			if (typeof nodeDef.inputs === 'object') {
				const input: Record<string, any> = {}
				for (const key in nodeDef.inputs) {
					const contextKey = nodeDef.inputs[key]
					if (contextKey.startsWith('_')) {
						input[key] = await asyncContext.get(contextKey as any)
					} else {
						const outputKey = `_outputs.${contextKey}`
						if (await asyncContext.has(outputKey as any)) {
							input[key] = await asyncContext.get(outputKey as any)
						} else {
							input[key] = await asyncContext.get(contextKey as any)
						}
					}
				}
				return input
			}
		}
		// Default to standardized input key
		const inputKey = `_inputs.${nodeDef.id}`
		return await asyncContext.get(inputKey as any)
	}
}
