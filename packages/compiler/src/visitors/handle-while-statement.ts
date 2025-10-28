import type * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleWhileStatement(analyzer: FlowAnalyzer, node: ts.WhileStatement): string | null {
	// Push scope for loop body
	analyzer.state.pushScope({ variables: new Map() })

	const exportName = 'loop-controller'
	const count = analyzer.state.incrementUsageCount(exportName)
	const controllerId = `${exportName}_${count}`
	const controllerNode: import('flowcraft').NodeDefinition = {
		id: controllerId,
		uses: 'loop-controller',
		params: { condition: node.expression.getText() || 'true' },
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

	// Create synthetic break target node
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

	// Push loop scope
	analyzer.state.pushLoopScope({ controllerId, breakTargetId })

	// Traverse the body and find first and last nodes
	const nodesBeforeBody = analyzer.state.getNodes().length
	const lastInBody = analyzer.traverse(node.statement)
	const firstInBody =
		analyzer.state.getNodes().length > nodesBeforeBody ? analyzer.state.getNodes()[nodesBeforeBody].id : null

	// Add continue edge from controller to first node in body
	if (firstInBody) {
		analyzer.state.addEdge({
			source: controllerId,
			target: firstInBody,
			action: 'continue',
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	// Add loopback edge from last in body to controller
	if (lastInBody) {
		analyzer.state.addEdge({
			source: lastInBody,
			target: controllerId,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}

	// Pop loop scope
	analyzer.state.popLoopScope()

	// Pop scope
	analyzer.state.popScope()

	// Set pending branches for nodes after the loop
	const exitEnds = [lastInBody || controllerId, breakTargetId]
	analyzer.state.setPendingBranches({ ends: exitEnds, joinStrategy: 'any' })

	// The loop controller's break action should point to breakTargetId
	analyzer.state.addEdge({
		source: controllerId,
		target: breakTargetId,
		action: 'break',
		_sourceLocation: analyzer.getSourceLocation(node),
	})

	// Set cursor to null since pending branches will handle connections
	analyzer.state.setCursor(null)
	return null
}
