import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'
import { handleAwaitCall } from './handle-await-call'
import { handlePromiseAll } from './handle-promise-all'

export function handleAwaitExpression(analyzer: FlowAnalyzer, node: ts.AwaitExpression): void {
	const callee = node.expression
	if (ts.isCallExpression(callee)) {
		// Check for Promise.all parallel execution
		if (analyzer.isPromiseAllCall(callee)) {
			handlePromiseAll(analyzer, callee, node)
			return
		}

		// Check if it's context.get or context.set, ignore
		if (ts.isPropertyAccessExpression(callee.expression)) {
			const propAccess = callee.expression
			if (propAccess.expression.getText() === 'context') {
				return
			}
		}

		// Perform type checking for function calls
		analyzer.checkFunctionCallTypes(callee)

		// Handle the await call
		handleAwaitCall(analyzer, callee, node)
	}
}
