import * as path from 'node:path'
import type { WorkflowBlueprint } from 'flowcraft'
import ts from 'typescript'
import { FlowAnalyzer } from './flow-analyzer'
import type { CompilationOutput, FileAnalysis } from './types'

function isAsyncAndAnnotated(
	funcNode: ts.FunctionDeclaration | ts.ArrowFunction,
): { type: 'flow' | 'step' } | null {
	if (
		ts.isFunctionDeclaration(funcNode) &&
		!funcNode.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)
	) {
		return null
	}
	if (
		ts.isArrowFunction(funcNode) &&
		!funcNode.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)
	) {
		return null
	}
	const jsDocTags = ts.getJSDocTags(funcNode)
	const hasFlowTag = jsDocTags.some((tag) => tag.tagName.text === 'flow')
	const hasStepTag = jsDocTags.some((tag) => tag.tagName.text === 'step')
	if (hasFlowTag) return { type: 'flow' }
	if (hasStepTag) return { type: 'step' }
	return null
}

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
				{ type: 'flow' | 'step'; node: ts.FunctionDeclaration | ts.ArrowFunction }
			>()

			ts.forEachChild(sourceFile, (node) => {
				// handle named re-exports: export { foo } from '...'
				if (ts.isExportDeclaration(node)) {
					if (node.exportClause && ts.isNamedExports(node.exportClause)) {
						node.exportClause.elements.forEach((element) => {
							const symbol = this.typeChecker.getSymbolAtLocation(element.name)
							if (symbol) {
								let originalSymbol = symbol
								if (symbol.flags & ts.SymbolFlags.Alias) {
									originalSymbol = this.typeChecker.getAliasedSymbol(symbol)
								}
								if (originalSymbol?.valueDeclaration) {
									const decl = originalSymbol.valueDeclaration
									const annotation = ts.isFunctionDeclaration(decl)
										? isAsyncAndAnnotated(decl)
										: null
									if (annotation) {
										exports.set(element.name.text, {
											...annotation,
											node: decl as ts.FunctionDeclaration,
										})
									}
								}
							}
						})
					}
					return
				}

				// handle default exports:
				//   export default async function foo() {}  (FunctionDeclaration with DefaultKeyword)
				//   export default async () => {}             (ExportAssignment)
				if (ts.isExportAssignment(node) && !node.isExportEquals) {
					const expr = node.expression
					if (ts.isArrowFunction(expr)) {
						const exportName = path.basename(filePath, path.extname(filePath))
						const annotation = isAsyncAndAnnotated(expr)
						if (annotation) {
							exports.set(exportName, { ...annotation, node: expr })
						}
					}
					return
				}

				// handle function declarations:
				//   export async function foo() {}        (named export)
				//   export default async function foo() {}  (named default)
				//   export default async function() {}      (anonymous default)
				if (
					ts.isFunctionDeclaration(node) &&
					ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export
				) {
					const annotation = isAsyncAndAnnotated(node)
					if (annotation) {
						const exportName = node.name
							? node.name.text
							: path.basename(filePath, path.extname(filePath))
						exports.set(exportName, { ...annotation, node })
					}
					return
				}

				// handle variable declarations with arrow/function expressions:
				// export const foo = async () => {}
				// export const foo = async function() {}
				if (
					ts.isVariableStatement(node) &&
					node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
				) {
					for (const decl of node.declarationList.declarations) {
						if (decl.name && ts.isIdentifier(decl.name) && decl.initializer) {
							const init = decl.initializer
							// arrow function
							if (ts.isArrowFunction(init)) {
								const annotation = isAsyncAndAnnotated(init)
								if (annotation) {
									exports.set(decl.name.text, {
										...annotation,
										node: init,
									})
								}
							}
							// function expression (with JSDoc on the parent declaration)
							if (ts.isFunctionExpression(init)) {
								let jsDocTags = ts.getJSDocTags(decl)
								if (jsDocTags.length === 0) {
									jsDocTags = ts.getJSDocTags(node as unknown as ts.Declaration)
								}
								const hasFlowTag = jsDocTags.some(
									(tag) => tag.tagName.text === 'flow',
								)
								const hasStepTag = jsDocTags.some(
									(tag) => tag.tagName.text === 'step',
								)
								if (hasFlowTag || hasStepTag) {
									if (
										init.modifiers?.some(
											(mod) => mod.kind === ts.SyntaxKind.AsyncKeyword,
										)
									) {
										exports.set(decl.name.text, {
											type: hasFlowTag ? 'flow' : 'step',
											node: init as unknown as ts.ArrowFunction,
										})
									}
								}
							}
						}
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
			const relative = path.relative(manifestDir, importPath)
			const parsed = path.parse(relative)
			const relativePath = path.join(parsed.dir, parsed.name)
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
