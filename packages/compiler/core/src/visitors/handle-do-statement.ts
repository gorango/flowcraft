import type { NodeDefinition } from 'flowcraft'
import type ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleDoStatement(analyzer: FlowAnalyzer, node: ts.DoStatement): string | null {
	analyzer.state.pushScope({ variables: new Map() })

	const controllerName = 'loop-controller'
	const count = analyzer.state.incrementUsageCount(controllerName)
	const controllerId = `${controllerName}_${count}`
	const controllerNode: NodeDefinition = {
		id: controllerId,
		uses: 'loop-controller',
		params: { condition: node.expression.getText() || 'true' },
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(controllerNode)

	// synthetic break target
	const joinName = 'join'
	const joinCount = analyzer.state.incrementUsageCount(joinName)
	const breakTargetId = `${joinName}_${joinCount}`
	const breakTargetNode: NodeDefinition = {
		id: breakTargetId,
		uses: 'join',
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(breakTargetNode)

	analyzer.state.pushLoopScope({ controllerId, breakTargetId })

	// traverse body BEFORE the controller check (do-while runs body at least once)
	const cursor = analyzer.state.getCursor()
	analyzer.state.setCursor(null)
	const nodesBeforeBody = analyzer.state.getNodes().length
	const lastInBody = analyzer.traverse(node.statement)
	const firstInBody =
		analyzer.state.getNodes().length > nodesBeforeBody
			? analyzer.state.getNodes()[nodesBeforeBody].id
			: null

	// wire predecessor directly to first body node (unconditional, first iteration)
	if (firstInBody && cursor) {
		analyzer.state.addEdge({
			source: cursor,
			target: firstInBody,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	// wire end of body to controller (condition check)
	if (lastInBody) {
		analyzer.state.addEdge({
			source: lastInBody,
			target: controllerId,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	// conditional continue edge from controller back to first body node
	if (firstInBody) {
		analyzer.state.addEdge({
			source: controllerId,
			target: firstInBody,
			action: 'continue',
			condition: node.expression.getText(),
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	analyzer.state.popLoopScope()
	analyzer.state.popScope()

	// break edge from controller to break target
	analyzer.state.addEdge({
		source: controllerId,
		target: breakTargetId,
		action: 'break',
		_sourceLocation: analyzer.getSourceLocation(node),
	})

	analyzer.state.setPendingBranches({
		ends: [lastInBody || breakTargetId, breakTargetId],
		joinStrategy: 'any',
	})

	analyzer.state.setCursor(null)
	return null
}
