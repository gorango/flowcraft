import { analyzeBlueprint } from '../analysis'
import { FlowcraftError } from '../errors'
import { BaseNode } from '../node'
import { ExecutionContext } from '../runtime/execution-context'
import { WorkflowState } from '../runtime/state'
import { GraphTraverser } from '../runtime/traverser'
import type { NodeContext, NodeResult } from '../types'

export class SubflowNode extends BaseNode {
	async exec(
		_prepResult: any,
		context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		const { blueprintId, inputs, outputs } = this.params ?? {}
		const { runtime, workflowState } = context.dependencies

		if (!blueprintId) {
			throw new FlowcraftError(`Subflow node '${this.nodeId}' is missing 'blueprintId' parameter.`, { isFatal: true })
		}

		const subBlueprint =
			(runtime as any).blueprints?.[blueprintId] || (runtime as any).runtime?.blueprints?.[blueprintId]
		if (!subBlueprint) {
			throw new FlowcraftError(`Sub-blueprint '${blueprintId}' not found in runtime registry.`, { isFatal: true })
		}

		const subflowInitialContext: Record<string, any> = {}

		if (inputs) {
			// explicit inputs
			for (const [targetKey, sourceKey] of Object.entries(inputs as Record<string, string>)) {
				let value = await context.context.get(sourceKey as any)
				if (value === undefined) {
					value = await context.context.get(`_outputs.${sourceKey}` as any)
				}
				subflowInitialContext[targetKey] = value
			}
		} else if (context.input !== undefined) {
			// pass the parent node's input to the subflow's start nodes
			const subAnalysis = analyzeBlueprint(subBlueprint)
			for (const startNodeId of subAnalysis.startNodeIds) {
				const inputKey = `_inputs.${startNodeId}`
				subflowInitialContext[inputKey] = context.input
			}
		}

		const subflowState = new WorkflowState(subflowInitialContext)
		const subflowExecContext = new ExecutionContext(
			subBlueprint,
			subflowState,
			runtime.nodeRegistry,
			runtime.executionId,
			runtime.runtime,
			runtime.services,
			runtime.signal,
			runtime.concurrency,
		)
		const subflowTraverser = new GraphTraverser(subBlueprint)

		const subflowResult = await runtime.runtime.orchestrator.run(subflowExecContext, subflowTraverser)

		if (subflowResult.status === 'awaiting') {
			workflowState.markAsAwaiting(this.nodeId ?? '')
			const subflowStateKey = `_subflowState.${this.nodeId}`
			await context.context.set(subflowStateKey as any, subflowResult.serializedContext)
			return { output: undefined }
		}

		if (subflowResult.status !== 'completed') {
			const firstError = subflowResult.errors?.[0]
			const errorMessage = firstError?.message || 'Unknown error'
			throw new FlowcraftError(
				`Sub-workflow '${blueprintId}' did not complete successfully. Status: ${subflowResult.status}. Error: ${errorMessage}`,
				{
					cause: firstError,
					nodeId: this.nodeId,
					blueprintId,
				},
			)
		}

		const subflowFinalContext = subflowResult.context as Record<string, any>

		if (outputs) {
			for (const [parentKey, subKey] of Object.entries(outputs as Record<string, string>)) {
				const value = subflowFinalContext[`_outputs.${subKey}`] ?? subflowFinalContext[subKey]
				await context.context.set(parentKey as any, value)
			}
			return { output: subflowFinalContext } // Return the whole context if mapping is used
		}

		const subAnalysis = analyzeBlueprint(subBlueprint)
		if (subAnalysis.terminalNodeIds.length === 1) {
			const terminalId = subAnalysis.terminalNodeIds[0]
			return subflowFinalContext[`_outputs.${terminalId}`]
		}

		const terminalOutputs: Record<string, any> = {}
		for (const terminalId of subAnalysis.terminalNodeIds) {
			terminalOutputs[terminalId] = subflowFinalContext[`_outputs.${terminalId}`]
		}
		return terminalOutputs
	}
}
