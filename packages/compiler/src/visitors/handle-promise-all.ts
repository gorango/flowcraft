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

	return analyzer.state.getCursor()
}
