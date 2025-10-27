import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleForOfStatement(analyzer: FlowAnalyzer, node: ts.ForOfStatement): string | null {
	// De-sugar for...of into a while loop pattern
	// Create iterator variable: const __iterator = items[Symbol.iterator]()
	// Create result variable: let __result
	// While condition: !(__result = __iterator.next()).done
	// In body: const item = __result.value; ...original body...

	// Check for break/continue in the loop body
	ts.forEachChild(node.statement, (child) => {
		if (ts.isBreakStatement(child) || ts.isContinueStatement(child)) {
			analyzer.addDiagnostic(child, 'error', `Break and continue statements are not supported in flow functions.`)
		}
	})

	// Push scope for loop body
	analyzer.state.pushScope({ variables: new Map() })

	const exportName = 'loop-controller'
	const count = analyzer.state.incrementUsageCount(exportName)
	const controllerId = `${exportName}_${count}`
	const controllerNode: import('flowcraft').NodeDefinition = {
		id: controllerId,
		uses: 'loop-controller',
		params: { condition: `${node.expression.getText()}.length > 0` }, // Simplified condition for loop controller
		config: { joinStrategy: 'any' },
		_sourceLocation: analyzer.getSourceLocation(node),
	}
	analyzer.state.addNode(controllerNode)
	if (analyzer.state.getCursor()) {
		analyzer.state.addEdge({
			source: analyzer.state.getCursor()!,
			target: controllerId,
			_sourceLocation: analyzer.getSourceLocation(node),
		})
	}
	const _prevCursor = analyzer.state.getCursor()
	analyzer.state.setCursor(controllerId)

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

	// Pop scope
	analyzer.state.popScope()

	// The exit path is the current cursor (controller), next nodes will connect with break
	analyzer.state.setCursor(controllerId)
	return analyzer.state.getCursor()
}
