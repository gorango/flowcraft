import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'
import { processParallelCall } from './process-parallel-call'

export function handlePromiseAll(
	analyzer: FlowAnalyzer,
	node: ts.CallExpression,
	_awaitNode: ts.AwaitExpression,
	method: 'all' | 'allSettled' | 'race' = 'all',
): string | null {
	const arrayArg = node.arguments[0]
	if (!arrayArg || !ts.isArrayLiteralExpression(arrayArg)) {
		analyzer.addDiagnostic(
			node,
			'error',
			`Promise.${method} requires an array literal argument`,
		)
		return analyzer.state.getCursor()
	}

	const scatterPoint = analyzer.state.getCursor()

	const parallelNodeIds: string[] = []
	for (const element of arrayArg.elements) {
		if (ts.isCallExpression(element)) {
			const nodeId = processParallelCall(analyzer, element)
			if (nodeId) {
				parallelNodeIds.push(nodeId)
				if (scatterPoint) {
					analyzer.state.addEdge({
						source: scatterPoint,
						target: nodeId,
						_sourceLocation: analyzer.getSourceLocation(node),
					})
				}
			}
		}
	}

	const joinStrategy = method === 'all' || method === 'allSettled' ? 'all' : 'any'
	analyzer.state.setPendingBranches({ ends: parallelNodeIds, joinStrategy })

	// Map destructured array variables to respective parallel nodes
	const parent = _awaitNode.parent
	if (
		parent &&
		ts.isVariableDeclaration(parent) &&
		parent.name &&
		ts.isArrayBindingPattern(parent.name)
	) {
		const bindingPattern = parent.name
		const currentScope = analyzer.state.getScopes()[analyzer.state.getScopes().length - 1]
		for (let i = 0; i < Math.min(bindingPattern.elements.length, parallelNodeIds.length); i++) {
			const element = bindingPattern.elements[i]
			if (element && ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
				const varName = element.name.text
				const nodeId = parallelNodeIds[i]
				currentScope.variables.set(varName, {
					nodeId,
					type: analyzer.typeChecker.getTypeAtLocation(element),
					variableType: 'normal',
				})
			}
		}
	}

	return analyzer.state.getCursor()
}
