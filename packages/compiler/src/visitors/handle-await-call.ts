import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

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
					if (exportInfo.type === 'step') {
						nodeDef = {
							id: `${exportName}_${count}`,
							uses: exportName,
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
