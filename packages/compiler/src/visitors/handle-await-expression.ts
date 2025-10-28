import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'
import { handleAwaitCall } from './handle-await-call'
import { handlePromiseAll } from './handle-promise-all'

/**
 * Checks if a call expression is calling a durable primitive from 'flowcraft/sdk'
 */
function isDurablePrimitiveCall(
	typeChecker: ts.TypeChecker,
	callExpression: ts.CallExpression,
): { primitiveName: string } | null {
	const callee = callExpression.expression
	if (!ts.isIdentifier(callee)) {
		return null
	}

	let symbol: ts.Symbol | undefined
	try {
		symbol = typeChecker.getSymbolAtLocation(callee)
	} catch (_error) {
		return null
	}
	if (!symbol) {
		return null
	}

	// Get the original symbol (in case of aliases)
	let originalSymbol: ts.Symbol
	try {
		originalSymbol = symbol.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol
	} catch (_error) {
		return null
	}

	// Find the declaration
	const declarations = originalSymbol.getDeclarations()
	if (!declarations || declarations.length === 0) {
		return null
	}

	// Check if it's imported from 'flowcraft/sdk'
	for (const declaration of declarations) {
		if (ts.isImportSpecifier(declaration)) {
			const importDeclaration = declaration.parent.parent.parent
			if (ts.isImportDeclaration(importDeclaration) && ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
				const moduleSpecifier = importDeclaration.moduleSpecifier.text
				if (moduleSpecifier === 'flowcraft/sdk' || moduleSpecifier === '../../../flowcraft/dist/sdk') {
					const primitiveName = declaration.name.text
					if (['sleep', 'waitForEvent', 'createWebhook'].includes(primitiveName)) {
						return { primitiveName }
					}
				}
			}
		}
	}

	return null
}

export function handleAwaitExpression(analyzer: FlowAnalyzer, node: ts.AwaitExpression): void {
	const expression = node.expression

	// Handle property access expressions like `webhook.request`
	if (ts.isPropertyAccessExpression(expression)) {
		const propAccess = expression
		const propertyName = propAccess.name.text

		// Check if this is `variable.request` where variable is from createWebhook
		if (propertyName === 'request' && ts.isIdentifier(propAccess.expression)) {
			const varName = propAccess.expression.text

			// Check if this variable is tracked and came from createWebhook
			const variableInfo = analyzer.state.getVariableInScope(varName)
			if (variableInfo && variableInfo.variableType === 'webhook') {
				// This is `await webhook.request` where webhook came from createWebhook
				const count = analyzer.state.incrementUsageCount('webhook_request')
				const waitNode = {
					id: `wait_for_webhook_${count}`,
					uses: 'wait',
					params: { eventName: `webhook:${variableInfo.nodeId}` },
				}
				analyzer.state.addNodeAndWire(waitNode, node, analyzer.sourceFile, analyzer.typeChecker)
				return
			}
		}

		// Check if it's context.get or context.set, ignore
		if (propAccess.expression.getText() === 'context') {
			return
		}
	}

	if (ts.isCallExpression(expression)) {
		const callee = expression
		// Check for Promise.all parallel execution
		if (analyzer.isPromiseAllCall(callee)) {
			handlePromiseAll(analyzer, callee, node)
			return
		}

		// Check for durable primitives from 'flowcraft/sdk' (new API)
		const primitiveCall = isDurablePrimitiveCall(analyzer.typeChecker, callee)
		if (primitiveCall) {
			const { primitiveName } = primitiveCall
			const count = analyzer.state.incrementUsageCount(primitiveName)
			let nodeDef: any

			switch (primitiveName) {
				case 'sleep':
					nodeDef = {
						id: `sleep_${count}`,
						uses: 'sleep',
						params: { duration: callee.arguments[0].getText() },
					}
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
					break

				case 'waitForEvent':
					nodeDef = {
						id: `wait_${count}`,
						uses: 'wait',
						params: { eventName: callee.arguments[0].getText() },
					}
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
					break

				case 'createWebhook': {
					// This is a two-step transformation.
					// 1. The `createWebhook` call itself becomes a 'webhook' node that returns the URL/event.
					const webhookNode = {
						id: `webhook_${count}`,
						uses: 'webhook',
					}
					analyzer.state.addNodeAndWire(webhookNode, node, analyzer.sourceFile, analyzer.typeChecker)

					// 2. The subsequent `await webhook.request` is implicitly a `wait` node.
					// For now, we'll handle this in a simplified way - the compiler needs to track variable assignments
					// This is complex and would require more sophisticated AST analysis
					break
				}

				default:
					analyzer.addDiagnostic(node, 'error', `Unknown durable primitive '${primitiveName}'.`)
			}
			return
		}

		// Check for Flow SDK primitives (old API - for backward compatibility)
		if (ts.isPropertyAccessExpression(callee.expression) && callee.expression.expression.getText() === 'Flow') {
			const primitiveName = callee.expression.name.text
			const count = analyzer.state.incrementUsageCount(primitiveName)
			let nodeDef: any

			switch (primitiveName) {
				case 'sleep':
					nodeDef = {
						id: `sleep_${count}`,
						uses: 'sleep',
						params: { duration: callee.arguments[0].getText() },
					}
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
					break

				case 'waitForEvent':
					nodeDef = {
						id: `wait_${count}`,
						uses: 'wait',
						params: { eventName: callee.arguments[0].getText() },
					}
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
					break

				case 'createWebhook': {
					// This is a two-step transformation.
					// 1. The `createWebhook` call itself becomes a 'webhook' node that returns the URL/event.
					const webhookNode = {
						id: `webhook_${count}`,
						uses: 'webhook',
					}
					analyzer.state.addNodeAndWire(webhookNode, node, analyzer.sourceFile, analyzer.typeChecker)

					// 2. The subsequent `await webhook.request` is implicitly a `wait` node.
					// For now, we'll handle this in a simplified way - the compiler needs to track variable assignments
					// This is complex and would require more sophisticated AST analysis
					break
				}

				default:
					analyzer.addDiagnostic(node, 'error', `Unknown Flow primitive '${primitiveName}'.`)
			}
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
