import type ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleTryStatement(analyzer: FlowAnalyzer, node: ts.TryStatement): string | null {
	if (node.finallyBlock) {
		analyzer.addDiagnostic(node.finallyBlock, 'error', `Finally blocks are not supported in flow functions.`)
	}

	// scan catch block to find fallback node
	let fallbackNodeId: string | null = null
	if (node.catchClause) {
		const savedUsageCounts = new Map(analyzer.state.getUsageCounts())
		const nodesBeforeCatch = analyzer.state.getNodes().length
		analyzer.traverse(node.catchClause.block)
		fallbackNodeId =
			analyzer.state.getNodes().length > nodesBeforeCatch ? analyzer.state.getNodes()[nodesBeforeCatch].id : null
		analyzer.state.getNodes().splice(nodesBeforeCatch)
		analyzer.state.setCursor(null)
		analyzer.state.setUsageCounts(savedUsageCounts)
	}

	analyzer.state.setFallbackScope(fallbackNodeId)

	const lastInTry = analyzer.traverse(node.tryBlock)

	analyzer.state.setFallbackScope(null)

	let lastInCatch: string | null = null
	if (node.catchClause) {
		lastInCatch = analyzer.traverse(node.catchClause.block)
	}

	const ends: string[] = []
	if (lastInTry) ends.push(lastInTry)
	if (lastInCatch) ends.push(lastInCatch)
	analyzer.state.setPendingBranches({ ends, joinStrategy: 'any' })

	return null
}
