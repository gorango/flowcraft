import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleSwitchStatement(
	analyzer: FlowAnalyzer,
	node: ts.SwitchStatement,
): string | null {
	let forkNodeId = analyzer.state.getCursor()

	if (!forkNodeId) {
		const startNode: NodeDefinition = {
			id: 'start',
			uses: 'start',
		}
		analyzer.state.addNode(startNode)
		forkNodeId = 'start'
	}
	const switchExpr = node.expression.getText()

	analyzer.state.pushScope({ variables: new Map() })

	const joinName = 'join'
	const joinCount = analyzer.state.incrementUsageCount(joinName)
	const joinNodeId = `${joinName}_${joinCount}`
	const joinNode: NodeDefinition = {
		id: joinNodeId,
		uses: 'join',
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(joinNode)

	// push switch scope so `break` inside cases routes to the join node
	analyzer.state.pushSwitchScope(joinNodeId)

	const prevCursor = analyzer.state.getCursor()
	const allCaseEnds: string[] = []

	for (const clause of node.caseBlock.clauses) {
		if (ts.isCaseClause(clause)) {
			const caseValue = clause.expression.getText()
			const condition = `${switchExpr} === ${caseValue}`

			analyzer.state.pushScope({ variables: new Map() })
			analyzer.state.setCursor(null)

			const nodesBefore = analyzer.state.getNodes().length
			const lastInCase = analyzer.traverse(clause)
			const firstInCase =
				analyzer.state.getNodes().length > nodesBefore
					? analyzer.state.getNodes()[nodesBefore].id
					: null

			analyzer.state.popScope()

			// connect fork to first node in case with condition
			if (firstInCase && forkNodeId) {
				analyzer.state.addEdge({
					source: forkNodeId,
					target: firstInCase,
					condition,
					_sourceLocation: analyzer.getSourceLocation(clause),
				})
			}

			// track last-in-case for pending branches
			if (lastInCase) {
				allCaseEnds.push(lastInCase)
			}
		} else if (ts.isDefaultClause(clause)) {
			analyzer.state.pushScope({ variables: new Map() })
			analyzer.state.setCursor(null)

			const nodesBefore = analyzer.state.getNodes().length
			const lastInDefault = analyzer.traverse(clause)
			const firstInDefault =
				analyzer.state.getNodes().length > nodesBefore
					? analyzer.state.getNodes()[nodesBefore].id
					: null

			analyzer.state.popScope()

			if (firstInDefault && forkNodeId) {
				// default case: unconditional fallback edge
				analyzer.state.addEdge({
					source: forkNodeId,
					target: firstInDefault,
					_sourceLocation: analyzer.getSourceLocation(clause),
				})
			}

			if (lastInDefault) {
				allCaseEnds.push(lastInDefault)
			}
		}
	}

	analyzer.state.popSwitchScope()
	analyzer.state.popScope()
	analyzer.state.setCursor(prevCursor)

	if (allCaseEnds.length > 0) {
		// route case ends to the join node
		for (const end of allCaseEnds) {
			analyzer.state.addEdge({
				source: end,
				target: joinNodeId,
				_sourceLocation: analyzer.getSourceLocation(node),
			})
		}
	}

	// set pending branches so subsequent code connects to either a case end or the join
	analyzer.state.setPendingBranches({
		ends: allCaseEnds.length > 0 ? [...allCaseEnds, joinNodeId] : [joinNodeId],
		joinStrategy: 'any',
	})

	return null
}
