import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

function getDottedPath(node: ts.PropertyAccessExpression): { base: string; path: string } | null {
	let current: ts.Expression = node
	const parts: string[] = []
	while (ts.isPropertyAccessExpression(current)) {
		parts.unshift(current.name.text)
		current = current.expression
	}
	if (ts.isIdentifier(current)) {
		return { base: current.text, path: parts.join('.') }
	}
	return null
}

function extractInputsMap(
	analyzer: FlowAnalyzer,
	callee: ts.CallExpression,
	funcDecl: ts.FunctionDeclaration | ts.ArrowFunction,
): Record<string, string> | undefined {
	const args = callee.arguments
	if (args.length === 0) return undefined

	const params = funcDecl.parameters
	const inputs: Record<string, string> = {}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		const paramDecl = params[i]
		let paramName: string
		if (paramDecl?.name && ts.isIdentifier(paramDecl.name)) {
			paramName = paramDecl.name.text
		} else {
			paramName = `_${i}`
		}

		if (ts.isIdentifier(arg)) {
			const varInfo = analyzer.state.getVariableInScope(arg.text)
			if (varInfo) {
				inputs[paramName] = varInfo.nodeId
			}
		} else if (ts.isPropertyAccessExpression(arg)) {
			const dotted = getDottedPath(arg)
			if (dotted) {
				const varInfo = analyzer.state.getVariableInScope(dotted.base)
				if (varInfo) {
					inputs[paramName] = `${varInfo.nodeId}.${dotted.path}`
				}
			}
		} else if (ts.isObjectLiteralExpression(arg)) {
			for (const prop of arg.properties) {
				if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
					const propName = prop.name.text
					const init = prop.initializer
					if (ts.isIdentifier(init)) {
						const varInfo = analyzer.state.getVariableInScope(init.text)
						if (varInfo) {
							inputs[propName] = varInfo.nodeId
						}
					} else if (ts.isPropertyAccessExpression(init)) {
						const dotted = getDottedPath(init)
						if (dotted) {
							const varInfo = analyzer.state.getVariableInScope(dotted.base)
							if (varInfo) {
								inputs[propName] = `${varInfo.nodeId}.${dotted.path}`
							}
						}
					}
				} else if (ts.isShorthandPropertyAssignment(prop)) {
					const propName = prop.name.text
					const varInfo = analyzer.state.getVariableInScope(propName)
					if (varInfo) {
						inputs[propName] = varInfo.nodeId
					}
				}
			}
		}
	}

	return Object.keys(inputs).length > 0 ? inputs : undefined
}

export function handleAwaitCall(
	analyzer: FlowAnalyzer,
	callee: ts.CallExpression,
	node: ts.AwaitExpression,
): void {
	const symbol = analyzer.typeChecker.getSymbolAtLocation(callee.expression)
	if (symbol) {
		let originalSymbol = symbol
		if (symbol.flags & ts.SymbolFlags.Alias) {
			originalSymbol = analyzer.typeChecker.getAliasedSymbol(symbol)
		}
		if (originalSymbol?.valueDeclaration) {
			const decl = originalSymbol.valueDeclaration
			const filePath = decl.getSourceFile().fileName
			const exportName = originalSymbol.name
			const fileAnalysis = analyzer.compiler.fileCache.get(filePath)
			if (fileAnalysis) {
				const exportInfo = fileAnalysis.exports.get(exportName)
				if (exportInfo) {
					let nodeDef: NodeDefinition
					const count = analyzer.state.incrementUsageCount(exportName)

					// extract argument-to-predecessor mappings
					const inputs = extractInputsMap(analyzer, callee, exportInfo.node)

					if (exportInfo.type === 'step') {
						nodeDef = {
							id: `${exportName}_${count}`,
							uses: exportName,
							inputs,
							_sourceLocation: analyzer.getSourceLocation(node),
						}
						const fallback = analyzer.state.getFallbackScope()
						if (fallback) {
							nodeDef.config = { fallback }
						}
						analyzer.registry[exportName] = { importPath: filePath, exportName }
					} else if (exportInfo.type === 'flow') {
						nodeDef = {
							id: `${exportName}_${count}`,
							uses: 'subflow',
							params: { blueprintId: exportName },
							inputs,
							_sourceLocation: analyzer.getSourceLocation(node),
						}
						const fallback = analyzer.state.getFallbackScope()
						if (fallback) {
							nodeDef.config = { fallback }
						}
					} else {
						analyzer.addDiagnostic(
							node,
							'warning',
							`The function '${exportName}' has an unknown export type and will be ignored.`,
						)
						return
					}
					analyzer.state.addNodeAndWire(
						nodeDef,
						node,
						analyzer.sourceFile,
						analyzer.typeChecker,
					)
				} else {
					analyzer.addDiagnostic(
						node,
						'error',
						`The function '${exportName}' is being awaited but is not a durable step or flow. To make it a durable operation, add a \`/** @step */\` JSDoc tag to its definition.`,
					)
				}
			} else {
				analyzer.addDiagnostic(
					node,
					'warning',
					`The function '${exportName}' is defined in '${filePath}' which was not scanned by the discovery pass. The call will be ignored.`,
				)
			}
		}
	}
}
