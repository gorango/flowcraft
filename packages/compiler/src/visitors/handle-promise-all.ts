import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'
import { processParallelCall } from './process-parallel-call'

export function handlePromiseAll(
	analyzer: FlowAnalyzer,
	node: ts.CallExpression,
	_awaitNode: ts.AwaitExpression,
): string | null {
	// Get the array argument
	const arrayArg = node.arguments[0]
	if (!arrayArg || !ts.isArrayLiteralExpression(arrayArg)) {
		analyzer.addDiagnostic(node, 'error', 'Promise.all requires an array literal argument')
		return analyzer.state.getCursor()
	}

	// Store the scatter point (current cursor before Promise.all)
	const scatterPoint = analyzer.state.getCursor()

	// Process each parallel call
	const parallelNodeIds: string[] = []
	for (const element of arrayArg.elements) {
		if (ts.isCallExpression(element)) {
			// This is a call expression in the array
			const nodeId = processParallelCall(analyzer, element)
			if (nodeId) {
				parallelNodeIds.push(nodeId)
				// Create edge from scatter point to parallel node
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

	// Set pending branches for the gather node (which will be processed by the next await)
	analyzer.state.setPendingBranches({ ends: parallelNodeIds, joinStrategy: 'all' })

	// The cursor remains at the scatter point; the next await will be the gather
	return analyzer.state.getCursor()
}
