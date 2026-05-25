import type ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleIfStatement(analyzer: FlowAnalyzer, node: ts.IfStatement): string | null {
	let forkNodeId = analyzer.state.getCursor()
	const condition = node.expression.getText()

	if (!forkNodeId) {
		const startNode: import('flowcraft').NodeDefinition = {
			id: 'start',
			uses: 'start',
		}
		analyzer.state.addNode(startNode)
		forkNodeId = 'start'
	}

	analyzer.state.pushScope({ variables: new Map() })

	const prevCursor = analyzer.state.getCursor()
	analyzer.state.setCursor(null)

	const nodesBeforeThen = analyzer.state.getNodes().length
	const lastInThen = analyzer.traverse(node.thenStatement)
	const firstInThen =
		analyzer.state.getNodes().length > nodesBeforeThen
			? analyzer.state.getNodes()[nodesBeforeThen].id
			: null
	const thenContinued = lastInThen !== null

	analyzer.state.popScope()

	if (firstInThen && forkNodeId) {
		analyzer.state.addEdge({
			source: forkNodeId,
			target: firstInThen,
			condition,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	let firstInElse: string | null = null
	let lastInElse: string | null = null
	let elseContinued = false
	if (node.elseStatement) {
		analyzer.state.pushScope({ variables: new Map() })

		analyzer.state.setCursor(null)
		const nodesBeforeElse = analyzer.state.getNodes().length
		lastInElse = analyzer.traverse(node.elseStatement)
		firstInElse =
			analyzer.state.getNodes().length > nodesBeforeElse
				? analyzer.state.getNodes()[nodesBeforeElse].id
				: null
		elseContinued = lastInElse !== null

		analyzer.state.popScope()

		if (firstInElse && forkNodeId) {
			analyzer.state.addEdge({
				source: forkNodeId,
				target: firstInElse,
				condition: `!(${condition})`,
				_sourceLocation: analyzer.getSourceLocation(node),
			})
		}
	} else {
		if (forkNodeId) {
			analyzer.state.addPendingForkEdge(forkNodeId, `!(${condition})`)
		}
	}

	// Only include continuing branches (skip terminated branches like throw/return)
	const ends: string[] = []
	if (lastInThen) ends.push(lastInThen)
	if (lastInElse) ends.push(lastInElse)

	if (ends.length > 0) {
		// At least one branch continues past the if — use join mechanism
		analyzer.state.setCursor(prevCursor)
		analyzer.state.setPendingBranches({ ends, joinStrategy: 'any' })
	} else if (thenContinued || elseContinued) {
		// Both are continuing (unlikely given check above)
		analyzer.state.setCursor(prevCursor)
	} else {
		// All branches terminated — set cursor to null
		analyzer.state.setCursor(null)
	}

	return null
}
