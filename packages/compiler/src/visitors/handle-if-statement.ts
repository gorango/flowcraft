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
	analyzer.state.setCursor(null) // prevent unconditional edges in branch
	const nodesBeforeIf = analyzer.state.getNodes().length
	const lastInIf = analyzer.traverse(node.thenStatement)
	const firstInIf =
		analyzer.state.getNodes().length > nodesBeforeIf ? analyzer.state.getNodes()[nodesBeforeIf].id : null
	analyzer.state.setCursor(prevCursor)

	analyzer.state.popScope()

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
		analyzer.state.pushScope({ variables: new Map() })

		analyzer.state.setCursor(null) // prevent unconditional edges in branch
		const nodesBeforeElse = analyzer.state.getNodes().length
		lastInElse = analyzer.traverse(node.elseStatement)
		firstInElse =
			analyzer.state.getNodes().length > nodesBeforeElse ? analyzer.state.getNodes()[nodesBeforeElse].id : null
		analyzer.state.setCursor(prevCursor)

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

	const ends: string[] = []
	if (lastInIf) ends.push(lastInIf)
	else if (firstInIf) ends.push(firstInIf)
	if (lastInElse) ends.push(lastInElse)
	else if (firstInElse) ends.push(firstInElse)
	analyzer.state.setPendingBranches({ ends, joinStrategy: 'any' })

	return null
}
