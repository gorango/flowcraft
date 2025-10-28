import type ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleForOfStatement(analyzer: FlowAnalyzer, node: ts.ForOfStatement): string | null {
	// de-sugar for...of into a while loop pattern
	// create iterator variable: const __iterator = items[Symbol.iterator]()
	// create result variable: let __result
	// while condition: !(__result = __iterator.next()).done
	// in body: const item = __result.value; ...original body...

	analyzer.state.pushScope({ variables: new Map() })

	const exportName = 'loop-controller'
	const count = analyzer.state.incrementUsageCount(exportName)
	const controllerId = `${exportName}_${count}`
	const controllerNode: import('flowcraft').NodeDefinition = {
		id: controllerId,
		uses: 'loop-controller',
		params: { condition: 'true' }, // loop controller handles iteration termination
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(controllerNode)
	const cursor = analyzer.state.getCursor()
	if (cursor) {
		analyzer.state.addEdge({
			source: cursor,
			target: controllerId,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}
	analyzer.state.setCursor(controllerId)

	// create synthetic break target node
	const joinExportName = 'join'
	const joinCount = analyzer.state.incrementUsageCount(joinExportName)
	const breakTargetId = `${joinExportName}_${joinCount}`
	const breakTargetNode: import('flowcraft').NodeDefinition = {
		id: breakTargetId,
		uses: 'join',
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(breakTargetNode)

	analyzer.state.pushLoopScope({ controllerId, breakTargetId })

	const nodesBeforeBody = analyzer.state.getNodes().length
	const lastInBody = analyzer.traverse(node.statement)
	const firstInBody =
		analyzer.state.getNodes().length > nodesBeforeBody ? analyzer.state.getNodes()[nodesBeforeBody].id : null

	if (firstInBody) {
		analyzer.state.addEdge({
			source: controllerId,
			target: firstInBody,
			action: 'continue',
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	if (lastInBody) {
		analyzer.state.addEdge({
			source: lastInBody,
			target: controllerId,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	analyzer.state.popLoopScope()

	analyzer.state.popScope()

	const exitEnds = [lastInBody || controllerId, breakTargetId]
	analyzer.state.setPendingBranches({ ends: exitEnds, joinStrategy: 'any' })

	analyzer.state.addEdge({
		source: controllerId,
		target: breakTargetId,
		action: 'break',
		_sourceLocation: analyzer.getSourceLocation(node),
	})

	// set cursor to null - pending branches will handle connections
	analyzer.state.setCursor(null)
	return null
}
