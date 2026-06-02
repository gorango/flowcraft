import ts from 'typescript'
import type { WorkflowBlueprint, NodeDefinition } from 'flowcraft'
import { FlowAnalyzer } from './flow-analyzer'
import type { CompilationDiagnostic, FileAnalysis } from './types'
import { createVirtualProgram } from './browser-utils'
import { extractStepMetas, preprocessCode, remapNode } from './shared'

export interface BrowserCompileResult {
	blueprint: WorkflowBlueprint | null
	diagnostics: CompilationDiagnostic[]
	registry: Record<string, Function>
}

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

function discoverExports(sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): FileAnalysis {
	const filePath = sourceFile.fileName
	const exports = new Map<
		string,
		{ type: 'flow' | 'step'; node: ts.FunctionDeclaration | ts.ArrowFunction }
	>()

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isExportDeclaration(node)) {
			if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				node.exportClause.elements.forEach((element) => {
					const symbol = typeChecker.getSymbolAtLocation(element.name)
					if (symbol) {
						let originalSymbol = symbol
						if (symbol.flags & ts.SymbolFlags.Alias) {
							originalSymbol = typeChecker.getAliasedSymbol(symbol)
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

		if (ts.isExportAssignment(node) && !node.isExportEquals) {
			const expr = node.expression
			if (ts.isArrowFunction(expr)) {
				const exportName =
					filePath
						.replace(/\.\w+$/, '')
						.split('/')
						.pop() || 'default'
				const annotation = isAsyncAndAnnotated(expr)
				if (annotation) {
					exports.set(exportName, { ...annotation, node: expr })
				}
			}
			return
		}

		if (
			ts.isFunctionDeclaration(node) &&
			ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export
		) {
			const annotation = isAsyncAndAnnotated(node)
			if (annotation) {
				const exportName = node.name?.text || 'default'
				exports.set(exportName, { ...annotation, node })
			}
			return
		}

		if (
			ts.isVariableStatement(node) &&
			node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
		) {
			for (const decl of node.declarationList.declarations) {
				if (decl.name && ts.isIdentifier(decl.name) && decl.initializer) {
					const init = decl.initializer
					if (ts.isArrowFunction(init)) {
						const annotation = isAsyncAndAnnotated(init)
						if (annotation) {
							exports.set(decl.name.text, { ...annotation, node: init })
						}
					}
					if (ts.isFunctionExpression(init)) {
						let jsDocTags = ts.getJSDocTags(decl)
						if (jsDocTags.length === 0) {
							jsDocTags = ts.getJSDocTags(node as unknown as ts.Declaration)
						}
						const hasFlowTag = jsDocTags.some((tag) => tag.tagName.text === 'flow')
						const hasStepTag = jsDocTags.some((tag) => tag.tagName.text === 'step')
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

	return { filePath, sourceFile, exports }
}

function createWrappedStepFunctions(code: string): Record<string, Function> {
	const fns: Record<string, Function> = {}
	const stepRegex =
		/@step\s*(?:\{[^}]*\})?\s*\n(?:export\s+)?async\s+function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{([\s\S]*?)\n\}/g
	for (;;) {
		const match = stepRegex.exec(code)
		if (!match) break
		const name = match[1]
		const params = match[2].replace(/:\s*[^,)]+/g, '').trim()
		const body = match[3]
		try {
			const fn = new Function(`return async function ${name}(${params}) {${body}}`)()
			fns[name] = async (ctx: any) => {
				const result = await fn(ctx.input)
				if (result !== null && typeof result === 'object' && 'output' in result)
					return result
				return { output: result }
			}
		} catch (e) {
			console.warn(`Failed to create function '${name}':`, e)
		}
	}
	return fns
}

export function compileCodeBrowser(code: string, options?: { id?: string }): BrowserCompileResult {
	const stepMetas = extractStepMetas(code)
	const processed = preprocessCode(code)

	const files: Record<string, string> = {
		'/input.ts': processed,
		'/node_modules/flowcraft/index.d.ts': [
			'export interface NodeContext<TInput = any> {',
			'  context: IAsyncContext',
			'  input?: TInput',
			'  params: Record<string, any>',
			'  signal?: AbortSignal',
			'}',
			'export interface IAsyncContext {',
			'  get<T>(key: string): Promise<T | undefined>',
			'  set(key: string, value: any): Promise<void>',
			'}',
		].join('\n'),
	}

	const { program, typeChecker } = createVirtualProgram(files, { noLib: true })

	const fileCache = new Map<string, FileAnalysis>()
	for (const sourceFile of program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile) continue
		const analysis = discoverExports(sourceFile, typeChecker)
		fileCache.set(analysis.filePath, analysis)
	}

	const compilerShim = { fileCache, typeChecker }

	const registry = createWrappedStepFunctions(code)
	const blueprints: Record<string, WorkflowBlueprint> = {}
	const allDiagnostics: CompilationDiagnostic[] = []

	for (const [, fileAnalysis] of fileCache) {
		for (const [exportName, { type, node }] of fileAnalysis.exports) {
			if (type === 'flow') {
				const analyzer = new FlowAnalyzer(
					compilerShim as any,
					fileAnalysis.sourceFile,
					node,
					typeChecker,
				)
				const result = analyzer.analyze()
				const bp = result.blueprint
				if (options?.id) bp.id = options.id
				bp.nodes = bp.nodes.map((n: NodeDefinition) => remapNode(n, stepMetas))
				blueprints[exportName] = bp
				allDiagnostics.push(...result.diagnostics)
			}
		}
	}

	const values = Object.values(blueprints)
	return {
		blueprint: values[0] ?? null,
		diagnostics: allDiagnostics.filter((d) => !d.message.startsWith('Type error in call to')),
		registry,
	}
}
