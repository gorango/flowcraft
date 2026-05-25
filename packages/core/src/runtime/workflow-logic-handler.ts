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
		completedNodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<any>,
		executionId?: string,
	): Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]> {
		if (!result) return []

		const effectiveSourceNodeId = completedNodeId

		const directOutgoingEdges = blueprint.edges.filter(
			(edge) => edge.source === effectiveSourceNodeId,
		)

		const nodesThisIsAFallbackFor = blueprint.nodes.filter(
			(n) => n.config?.fallback === completedNodeId,
		)
		const inheritedOutgoingEdges = nodesThisIsAFallbackFor.flatMap((originalNode) =>
			blueprint.edges.filter((edge) => edge.source === originalNode.id),
		)
		const allPossibleEdges = [...directOutgoingEdges, ...inheritedOutgoingEdges]
		const outgoingEdges = [
			...new Map(
				allPossibleEdges.map((edge) => [
					`${edge.source}-${edge.target}-${edge.action || ''}-${edge.condition || ''}`,
					edge,
				]),
			).values(),
		]

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
				payload: {
					source: edge.source,
					target: edge.target,
					condition: edge.condition,
					result: evaluationResult,
				},
			})
			return evaluationResult
		}

		const completedNode = blueprint.nodes.find((n) => n.id === completedNodeId)
		const isLoopController = completedNode?.uses === 'loop-controller'

		if (isLoopController) {
			const conditionalEdges = outgoingEdges.filter((edge) => edge.condition)
			for (const edge of conditionalEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				} else {
					await this.eventBus.emit({
						type: 'node:skipped',
						payload: {
							nodeId: completedNodeId,
							edge,
							executionId: executionId || '',
							blueprintId: blueprint.id,
						},
					})
				}
			}
			if (matched.length > 0) {
				return matched
			}
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
						payload: {
							nodeId: completedNodeId,
							edge,
							executionId: executionId || '',
							blueprintId: blueprint.id,
						},
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
						payload: {
							nodeId: completedNodeId,
							edge,
							executionId: executionId || '',
							blueprintId: blueprint.id,
						},
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
		executionId?: string,
	): Promise<void> {
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		const predecessors = allPredecessors?.get(targetNode.id)
		const _hasSinglePredecessor = predecessors && predecessors.size === 1
		const hasExplicitInputs = targetNode.inputs !== undefined
		const hasEdgeTransform = edge.transform !== undefined

		let sourceOutput = sourceResult.output

		// When the target node has an explicit `inputs` map, resolve that node's output
		if (hasEdgeTransform && hasExplicitInputs && typeof targetNode.inputs === 'string') {
			const inputsKey = targetNode.inputs
			const resolvedKey = inputsKey.startsWith('_') ? inputsKey : `_outputs.${inputsKey}`
			if ((await asyncContext.has(resolvedKey as any)) && inputsKey !== edge.source) {
				sourceOutput = await asyncContext.get(resolvedKey as any)
			}
		}

		const finalInput = hasEdgeTransform
			? this.evaluator.evaluate(edge.transform!, {
					input: sourceOutput,
					context: await asyncContext.toJSON(),
				})
			: sourceOutput
		const inputKey = `_inputs.${targetNode.id}`
		await asyncContext.set(inputKey as any, finalInput)
		await this.eventBus.emit({
			type: 'context:change',
			payload: {
				sourceNode: edge.source,
				key: inputKey,
				op: 'set',
				value: finalInput,
				executionId: executionId || 'unknown',
			},
		})
		if (!hasExplicitInputs || hasEdgeTransform) {
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
				return await this.resolveInputValue(nodeDef.inputs, asyncContext)
			}
			if (typeof nodeDef.inputs === 'object') {
				const input: Record<string, any> = {}
				for (const key in nodeDef.inputs) {
					input[key] = await this.resolveInputValue(nodeDef.inputs[key], asyncContext)
				}
				return input
			}
		}
		// Default to standardized input key
		const inputKey = `_inputs.${nodeDef.id}`
		return await asyncContext.get(inputKey as any)
	}

	/**
	 * Resolves a single input value string.
	 * Supports:
	 *   - "_contextKey"         → direct context lookup
	 *   - "nodeId.prop.sub"    → fetch node output, resolve nested property
	 *   - "nodeId"             → fetch entire node output
	 *   - "key"                → fallback context lookup
	 */
	private async resolveInputValue(
		value: string,
		context: ContextImplementation<any>,
	): Promise<any> {
		if (value.startsWith('_')) {
			return await context.get(value as any)
		}

		const dotIndex = value.indexOf('.')
		if (dotIndex !== -1) {
			const baseKey = value.slice(0, dotIndex)
			const propertyPath = value.slice(dotIndex + 1)
			const outputKey = `_outputs.${baseKey}`
			if (await context.has(outputKey as any)) {
				const baseOutput = await context.get(outputKey as any)
				if (baseOutput !== undefined && baseOutput !== null) {
					const parts = propertyPath.split('.')
					let current = baseOutput
					for (const part of parts) {
						if (current === null || current === undefined) return undefined
						current = current[part]
					}
					return current
				}
			}
			return undefined
		}

		const outputKey = `_outputs.${value}`
		if (await context.has(outputKey as any)) {
			return await context.get(outputKey as any)
		}
		return await context.get(value as any)
	}
}
