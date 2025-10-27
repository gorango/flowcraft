import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleTryStatement(analyzer: FlowAnalyzer, node: ts.TryStatement): string | null {
	// Check for finally block
	if (node.finallyBlock) {
		analyzer.addDiagnostic(node.finallyBlock, 'error', `Finally blocks are not supported in flow functions.`)
	}

	// Pre-scan catch block to find fallback node
	let fallbackNodeId: string | null = null
	if (node.catchClause) {
		const savedUsageCounts = new Map(analyzer.state.getUsageCounts())
		const nodesBeforeCatch = analyzer.state.getNodes().length
		analyzer.traverse(node.catchClause.block)
		fallbackNodeId =
			analyzer.state.getNodes().length > nodesBeforeCatch ? analyzer.state.getNodes()[nodesBeforeCatch].id : null
		// Reset nodes and cursor since this was just a pre-scan
		analyzer.state.getNodes().splice(nodesBeforeCatch)
		analyzer.state.setCursor(null) // Reset cursor
		analyzer.state.setUsageCounts(savedUsageCounts)
	}

	// Set fallback scope
	analyzer.state.setFallbackScope(fallbackNodeId)

	// Traverse try block
	const lastInTry = analyzer.traverse(node.tryBlock)

	// Exit fallback scope
	analyzer.state.setFallbackScope(null)

	// Traverse catch block
	let lastInCatch: string | null = null
	if (node.catchClause) {
		lastInCatch = analyzer.traverse(node.catchClause.block)
	}

	// Set pending branches for the successor
	const ends: string[] = []
	if (lastInTry) ends.push(lastInTry)
	if (lastInCatch) ends.push(lastInCatch)
	analyzer.state.setPendingBranches({ ends, joinStrategy: 'any' })

	return null
}
