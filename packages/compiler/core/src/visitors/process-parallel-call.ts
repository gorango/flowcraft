import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function processParallelCall(
	analyzer: FlowAnalyzer,
	callNode: ts.CallExpression,
): string | null {
	const symbol = analyzer.typeChecker.getSymbolAtLocation(callNode.expression)
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
					const count = analyzer.state.incrementUsageCount(exportName)

					let nodeDef: NodeDefinition
					if (exportInfo.type === 'step') {
						nodeDef = {
							id: `${exportName}_parallel_${count}`,
							uses: exportName,
							_sourceLocation: analyzer.getSourceLocation(callNode),
						}
						analyzer.registry[exportName] = { importPath: filePath, exportName }
					} else if (exportInfo.type === 'flow') {
						nodeDef = {
							id: `${exportName}_parallel_${count}`,
							uses: 'subflow',
							params: { blueprintId: exportName },
							_sourceLocation: analyzer.getSourceLocation(callNode),
						}
					} else {
						analyzer.addDiagnostic(
							callNode,
							'warning',
							`The function '${exportName}' has an unknown export type and will be ignored in Promise.all.`,
						)
						return null
					}

					analyzer.state.addNode(nodeDef)
					return nodeDef.id
				} else if (
					ts.isFunctionDeclaration(decl) ||
					ts.isFunctionExpression(decl) ||
					ts.isArrowFunction(decl)
				) {
					// this is a local function declaration in the same file
					analyzer.addDiagnostic(
						callNode,
						'warning',
						`The function '${exportName}' used in Promise.all is not annotated with /** @step */ or /** @flow */. It will be treated as a step, but this may cause unexpected behavior.`,
					)

					const count = analyzer.state.incrementUsageCount(exportName)

					const nodeDef: NodeDefinition = {
						id: `${exportName}_${count}`,
						uses: exportName,
						_sourceLocation: analyzer.getSourceLocation(callNode),
					}
					const fallback = analyzer.state.getFallbackScope()
					if (fallback) {
						nodeDef.config = { fallback }
					}
					analyzer.registry[exportName] = { importPath: filePath, exportName }
					analyzer.state.addNode(nodeDef)
					return nodeDef.id
				} else {
					analyzer.addDiagnostic(
						callNode,
						'error',
						`The function '${exportName}' used in Promise.all is not a step or flow. Add a \`/** @step */\` annotation to make it a durable operation.`,
					)
				}
			} else {
				analyzer.addDiagnostic(
					callNode,
					'warning',
					`The function '${exportName}' is defined in '${filePath}' which was not scanned by the discovery pass. The call in Promise.all will be ignored.`,
				)
			}
		}
	} else {
		analyzer.addDiagnostic(
			callNode,
			'error',
			`Could not resolve symbol for '${callNode.expression.getText()}' in Promise.all.`,
		)
	}
	return null
}
