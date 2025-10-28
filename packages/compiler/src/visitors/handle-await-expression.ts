import ts from 'typescript'
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

	// original symbol (in case of aliases)
	let originalSymbol: ts.Symbol
	try {
		originalSymbol = symbol.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol
	} catch (_error) {
		return null
	}

	const declarations = originalSymbol.getDeclarations()
	if (!declarations || declarations.length === 0) {
		return null
	}

	for (const declaration of declarations) {
		if (ts.isImportSpecifier(declaration)) {
			const importDeclaration = declaration.parent.parent.parent
			if (ts.isImportDeclaration(importDeclaration) && ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
				const moduleSpecifier = importDeclaration.moduleSpecifier.text
				if (moduleSpecifier === 'flowcraft/sdk') {
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

	if (ts.isPropertyAccessExpression(expression)) {
		const propAccess = expression
		const propertyName = propAccess.name.text

		if (propertyName === 'request' && ts.isIdentifier(propAccess.expression)) {
			const varName = propAccess.expression.text

			const variableInfo = analyzer.state.getVariableInScope(varName)
			if (variableInfo && variableInfo.variableType === 'webhook') {
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

		if (propAccess.expression.getText() === 'context') {
			return
		}
	}

	if (ts.isCallExpression(expression)) {
		const callee = expression
		if (analyzer.isPromiseAllCall(callee)) {
			handlePromiseAll(analyzer, callee, node)
			return
		}

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
					// `createWebhook` call becomes a 'webhook' node that returns the URL/event
					const webhookNode = {
						id: `webhook_${count}`,
						uses: 'webhook',
					}
					analyzer.state.addNodeAndWire(webhookNode, node, analyzer.sourceFile, analyzer.typeChecker)

					// subsequent `await webhook.request` is implicitly a `wait` node
					break
				}

				default:
					analyzer.addDiagnostic(node, 'error', `Unknown durable primitive '${primitiveName}'.`)
			}
			return
		}

		if (ts.isPropertyAccessExpression(callee.expression)) {
			const propAccess = callee.expression
			if (propAccess.expression.getText() === 'context') {
				return
			}
		}

		analyzer.checkFunctionCallTypes(callee)

		handleAwaitCall(analyzer, callee, node)
	}
}
