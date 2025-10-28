import type { NodeDefinition } from 'flowcraft'
import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function processParallelCall(analyzer: FlowAnalyzer, callNode: ts.CallExpression): string | null {
	const symbol = analyzer.typeChecker.getSymbolAtLocation(callNode.expression)
	if (symbol) {
		let originalSymbol = symbol
		if (symbol.flags & ts.SymbolFlags.Alias) {
			originalSymbol = analyzer.typeChecker.getAliasedSymbol(symbol)
		}
		if (originalSymbol?.valueDeclaration) {
			const decl = originalSymbol.valueDeclaration
			const filePath = decl.getSourceFile().fileName
			const fileAnalysis = analyzer.compiler.fileCache.get(filePath)
			if (fileAnalysis) {
				const exportName = originalSymbol.name
				const exportInfo = fileAnalysis.exports.get(exportName)
				if (exportInfo) {
					// this is exported function (from another file or this one)
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
						return null
					}

					analyzer.state.addNode(nodeDef)
					return nodeDef.id
				} else if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
					// this is a local function declaration in the same file
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
				}
			}
		}
	}
	return null
}
