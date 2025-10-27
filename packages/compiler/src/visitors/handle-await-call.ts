import * as ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'
import type { NodeDefinition } from 'flowcraft'

export function handleAwaitCall(analyzer: FlowAnalyzer, callee: ts.CallExpression, node: ts.AwaitExpression): void {
	const symbol = analyzer.typeChecker.getSymbolAtLocation(callee.expression)
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
					// This is an exported function
					let nodeDef: NodeDefinition
					const count = analyzer.state.incrementUsageCount(exportName)
					if (exportInfo.type === 'step') {
						nodeDef = {
							id: `${exportName}_${count}`,
							uses: exportName,
							_sourceLocation: analyzer.getSourceLocation(node),
						}
						if (analyzer.state.getFallbackScope()) {
							nodeDef.config = { fallback: analyzer.state.getFallbackScope()! }
						}
						analyzer.registry[exportName] = { importPath: filePath, exportName }
					} else if (exportInfo.type === 'flow') {
						nodeDef = {
							id: `${exportName}_${count}`,
							uses: 'subflow',
							params: { blueprintId: exportName },
							_sourceLocation: analyzer.getSourceLocation(node),
						}
						if (analyzer.state.getFallbackScope()) {
							nodeDef.config = { fallback: analyzer.state.getFallbackScope()! }
						}
					} else {
						return // Unknown type
					}
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
				} else if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
					// This is a local function declaration in the same file, treat as step
					const count = analyzer.state.incrementUsageCount(exportName)

					const nodeDef: NodeDefinition = {
						id: `${exportName}_${count}`,
						uses: exportName,
						_sourceLocation: analyzer.getSourceLocation(node),
					}
					if (analyzer.state.getFallbackScope()) {
						nodeDef.config = { fallback: analyzer.state.getFallbackScope()! }
					}
					analyzer.registry[exportName] = { importPath: filePath, exportName }
					analyzer.state.addNodeAndWire(nodeDef, node, analyzer.sourceFile, analyzer.typeChecker)
				}
			}
		}
	}
}
