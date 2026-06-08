import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleForOfStatement(
	analyzer: FlowAnalyzer,
	node: ts.ForOfStatement,
): string | null {
	// track iteration variable: `for (const item of items) { ... }`
	const initializer = node.initializer
	let iterationVarName: string | null = null
	if (ts.isVariableDeclarationList(initializer) && initializer.declarations.length === 1) {
		const decl = initializer.declarations[0]
		if (decl.name && ts.isIdentifier(decl.name)) {
			iterationVarName = decl.name.text
		}
	}

	analyzer.state.pushScope({ variables: new Map() })

	const exportName = 'loop-controller'
	const count = analyzer.state.incrementUsageCount(exportName)
	const controllerId = `${exportName}_${count}`
	const controllerNode: NodeDefinition = {
		id: controllerId,
		uses: 'loop-controller',
		params: { condition: 'true' },
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

	const joinExportName = 'join'
	const joinCount = analyzer.state.incrementUsageCount(joinExportName)
	const breakTargetId = `${joinExportName}_${joinCount}`
	const breakTargetNode: NodeDefinition = {
		id: breakTargetId,
		uses: 'join',
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(breakTargetNode)

	analyzer.state.pushLoopScope({ controllerId, breakTargetId })

	// register the iteration variable in the loop body scope
	if (iterationVarName) {
		const currentScope = analyzer.state.getScopes()[analyzer.state.getScopes().length - 1]
		currentScope.variables.set(iterationVarName, {
			nodeId: `${controllerId}.current`,
			type: analyzer.typeChecker.getTypeAtLocation(node.expression),
			variableType: 'normal',
		})
	}

	const nodesBeforeBody = analyzer.state.getNodes().length
	const lastInBody = analyzer.traverse(node.statement)
	const firstInBody =
		analyzer.state.getNodes().length > nodesBeforeBody
			? analyzer.state.getNodes()[nodesBeforeBody].id
			: null

	// empty loop body optimization
	const bodyNodeCount = analyzer.state.getNodes().length - nodesBeforeBody
	if (bodyNodeCount === 0) {
		analyzer.addDiagnostic(
			node,
			'warning',
			`Loop body contains no durable operations. Consider using a standard JavaScript loop instead of a flow loop for in-process execution.`,
		)
	}

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

	analyzer.state.setCursor(null)
	return null
}
