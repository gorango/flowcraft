import type * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleIfStatement(analyzer: FlowAnalyzer, node: ts.IfStatement): string | null {
	let forkNodeId = analyzer.state.getCursor()
	const condition = node.expression.getText()

	// If no fork point, create a start node
	if (!forkNodeId) {
		const startNode: import('flowcraft').NodeDefinition = {
			id: 'start',
			uses: 'start',
		}
		analyzer.state.addNode(startNode)
		forkNodeId = 'start'
	}

	// Push scope for if block
	analyzer.state.pushScope({ variables: new Map() })

	// Traverse if block and find first and last nodes
	const prevCursor = analyzer.state.getCursor()
	analyzer.state.setCursor(null) // Prevent unconditional edges in branch
	const nodesBeforeIf = analyzer.state.getNodes().length
	const lastInIf = analyzer.traverse(node.thenStatement)
	const firstInIf =
		analyzer.state.getNodes().length > nodesBeforeIf ? analyzer.state.getNodes()[nodesBeforeIf].id : null
	analyzer.state.setCursor(prevCursor) // Restore

	// Pop scope
	analyzer.state.popScope()

	// Add conditional edge from fork to first in if
	if (firstInIf && forkNodeId) {
		analyzer.state.addEdge({
			source: forkNodeId,
			target: firstInIf,
			condition,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	let firstInElse: string | null = null
	let lastInElse: string | null = null
	if (node.elseStatement) {
		// Push scope for else block
		analyzer.state.pushScope({ variables: new Map() })

		// Traverse else block and find first and last nodes
		analyzer.state.setCursor(null) // Prevent unconditional edges in branch
		const nodesBeforeElse = analyzer.state.getNodes().length
		lastInElse = analyzer.traverse(node.elseStatement)
		firstInElse =
			analyzer.state.getNodes().length > nodesBeforeElse ? analyzer.state.getNodes()[nodesBeforeElse].id : null
		analyzer.state.setCursor(prevCursor) // Restore

		// Pop scope
		analyzer.state.popScope()

		// Add conditional edge from fork to first in else
		if (firstInElse && forkNodeId) {
			analyzer.state.addEdge({
				source: forkNodeId,
				target: firstInElse,
				condition: `!(${condition})`,
				_sourceLocation: analyzer.getSourceLocation(node),
			})
		}
	} else {
		// If no else, add pending fork edge for the negated condition to successor
		if (forkNodeId) {
			analyzer.state.addPendingForkEdge(forkNodeId, `!(${condition})`)
		}
	}

	// Set pending branches for the successor
	const ends: string[] = []
	if (lastInIf) ends.push(lastInIf)
	else if (firstInIf) ends.push(firstInIf)
	if (lastInElse) ends.push(lastInElse)
	else if (firstInElse) ends.push(firstInElse)
	analyzer.state.setPendingBranches({ ends, joinStrategy: 'any' })

	return null
}
