import * as path from 'node:path'
import type { WorkflowBlueprint } from 'flowcraft'
import ts from 'typescript'
import { FlowAnalyzer } from './flow-analyzer'
import type { CompilationOutput, FileAnalysis } from './types'

export class Compiler {
	private program: ts.Program
	private typeChecker: ts.TypeChecker
	public fileCache: Map<string, FileAnalysis> = new Map()
	private projectRoot: string
	private manifestPath: string

	constructor(tsConfigPath: string, manifestPath?: string) {
		const resolvedConfigPath = path.resolve(tsConfigPath)
		this.projectRoot = path.dirname(resolvedConfigPath)
		this.manifestPath = manifestPath
			? path.resolve(manifestPath)
			: path.resolve('./dist/flowcraft.manifest.ts')
		const config = ts.readConfigFile(resolvedConfigPath, ts.sys.readFile)
		const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, this.projectRoot)
		this.program = ts.createProgram(parsed.fileNames, parsed.options)
		this.typeChecker = this.program.getTypeChecker()
	}

	compileProject(entryFilePaths: string[], manifestPath?: string): CompilationOutput {
		this.discoveryPass()

		if (manifestPath) {
			this.manifestPath = path.resolve(manifestPath)
		}

		const blueprints: Record<string, WorkflowBlueprint> = {}
		const registry: Record<string, { importPath: string; exportName: string }> = {}
		const diagnostics: import('./types').CompilationDiagnostic[] = []

		for (const entryFilePath of entryFilePaths) {
			const resolvedPath = path.resolve(this.projectRoot, entryFilePath)
			const fileAnalysis = this.fileCache.get(resolvedPath)
			if (!fileAnalysis) {
				diagnostics.push({
					file: resolvedPath,
					line: 1,
					column: 1,
					message: `Entry file '${entryFilePath}' was not found in the TypeScript program or contains no @flow/@step exports.`,
					severity: 'warning',
				})
				continue
			}
			for (const [exportName, { type, node }] of fileAnalysis.exports) {
				if (type === 'flow') {
					const analyzer = new FlowAnalyzer(
						this,
						fileAnalysis.sourceFile,
						node,
						this.typeChecker,
					)
					const result = analyzer.analyze()
					blueprints[exportName] = result.blueprint
					Object.assign(registry, result.registry)
					diagnostics.push(...result.diagnostics)
				}
			}
		}

		const manifestSource = this.generateManifest(blueprints, registry)

		return {
			blueprints,
			registry,
			diagnostics,
			manifestSource,
			manifestPath: this.manifestPath,
		}
	}

	private discoveryPass(): void {
		for (const sourceFile of this.program.getSourceFiles()) {
			if (sourceFile.isDeclarationFile) continue
			const filePath = path.resolve(sourceFile.fileName)
			const exports = new Map<
				string,
				{ type: 'flow' | 'step'; node: ts.FunctionDeclaration }
			>()

			ts.forEachChild(sourceFile, (node) => {
				if (ts.isExportDeclaration(node)) {
					if (node.exportClause && ts.isNamedExports(node.exportClause)) {
						node.exportClause.elements.forEach((element) => {
							const symbol = this.typeChecker.getSymbolAtLocation(element.name)
							if (symbol) {
								let originalSymbol = symbol
								if (symbol.flags & ts.SymbolFlags.Alias) {
									originalSymbol = this.typeChecker.getAliasedSymbol(symbol)
								}
								if (
									originalSymbol?.valueDeclaration &&
									ts.isFunctionDeclaration(originalSymbol.valueDeclaration)
								) {
									const decl = originalSymbol.valueDeclaration
									const jsDocTags = ts.getJSDocTags(decl)
									const hasFlowTag = jsDocTags.some(
										(tag) => tag.tagName.text === 'flow',
									)
									const hasStepTag = jsDocTags.some(
										(tag) => tag.tagName.text === 'step',
									)
									if (hasFlowTag) {
										exports.set(element.name.text, {
											type: 'flow',
											node: decl,
										})
									} else if (hasStepTag) {
										exports.set(element.name.text, {
											type: 'step',
											node: decl,
										})
									}
								}
							}
						})
					}
				} else if (
					ts.isFunctionDeclaration(node) &&
					node.name &&
					ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export &&
					node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)
				) {
					const jsDocTags = ts.getJSDocTags(node)
					const hasFlowTag = jsDocTags.some((tag) => tag.tagName.text === 'flow')
					const hasStepTag = jsDocTags.some((tag) => tag.tagName.text === 'step')
					if (hasFlowTag) {
						exports.set(node.name.text, { type: 'flow', node })
					} else if (hasStepTag) {
						exports.set(node.name.text, { type: 'step', node })
					}
				}
			})

			this.fileCache.set(filePath, { filePath, sourceFile, exports })
		}
	}

	private generateManifest(
		blueprints: Record<string, import('flowcraft').WorkflowBlueprint>,
		registry: Record<string, { importPath: string; exportName: string }>,
	): string {
		const imports: string[] = []
		const registryEntries: string[] = []

		const manifestDir = path.dirname(this.manifestPath)
		for (const [uses, { importPath, exportName }] of Object.entries(registry)) {
			const relativePath = path.relative(manifestDir, importPath).replace(/\.ts$/, '')
			imports.push(
				`import { ${exportName} } from '${relativePath.split(path.sep).join(path.posix.sep)}'`,
			)
			registryEntries.push(`  '${uses}': ${exportName}`)
		}

		const blueprintEntries = Object.entries(blueprints)
			.map(([id, blueprint]) => `  '${id}': ${JSON.stringify(blueprint, null, 2)}`)
			.join(',\n')

		return `// Generated by @flowcraft/compiler
${imports.join('\n')}

import type { NodeImplementation, WorkflowBlueprint } from 'flowcraft'

export const registry: Record<string, NodeImplementation> = {
${registryEntries.join(',\n')}
}

export const blueprints: Record<string, WorkflowBlueprint> = {
${blueprintEntries}
}
`
	}
}
