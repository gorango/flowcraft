import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import ts from 'typescript'
import type { Compiler } from './compiler'
import { CompilerState } from './compiler-state'
import { handleAwaitExpression } from './visitors/handle-await-expression'
import { handleForOfStatement } from './visitors/handle-for-of-statement'
import { handleIfStatement } from './visitors/handle-if-statement'
import { handleTryStatement } from './visitors/handle-try-statement'
import { handleWhileStatement } from './visitors/handle-while-statement'
import { handleSwitchStatement } from './visitors/handle-switch-statement'
import { handleDoStatement } from './visitors/handle-do-statement'

export class FlowAnalyzer {
	registry: Record<string, { importPath: string; exportName: string }> = {}
	private diagnostics: import('./types').CompilationDiagnostic[] = []
	public state: CompilerState

	constructor(
		public compiler: Compiler,
		public sourceFile: ts.SourceFile,
		public functionNode: ts.FunctionDeclaration | ts.ArrowFunction,
		public typeChecker: ts.TypeChecker,
	) {
		this.state = new CompilerState()
	}

	analyze(): {
		blueprint: WorkflowBlueprint
		registry: Record<string, { importPath: string; exportName: string }>
		diagnostics: import('./types').CompilationDiagnostic[]
	} {
		this.checkGeneratorFunction()

		const body = this.functionNode.body
		if (body && ts.isBlock(body)) {
			this.traverse(body)
		}
		if (this.state.getNodes().length === 0) {
			const startNode: NodeDefinition = {
				id: 'start',
				uses: 'start',
				_sourceLocation: this.getSourceLocation(this.functionNode),
			}
			this.state.addNode(startNode)
			this.state.setCursor('start')
		}
		const name = ts.isFunctionDeclaration(this.functionNode)
			? this.functionNode.name?.text || 'anonymous'
			: 'anonymous'
		const blueprint: WorkflowBlueprint = {
			id: name,
			nodes: this.state.getNodes(),
			edges: this.state.getEdges(),
		}
		return { blueprint, registry: this.registry, diagnostics: this.diagnostics }
	}

	traverse(node: ts.Node): string | null {
		let lastCursor: string | null = null
		ts.forEachChild(node, (child) => {
			const result = this.visit(child)
			if (result !== undefined) {
				lastCursor = result
			}
		})
		return lastCursor
	}

	private visit(node: ts.Node): string | null {
		if (ts.isExpressionStatement(node)) {
			// check durable primitive calls without await
			if (ts.isCallExpression(node.expression)) {
				const primitiveCall = this.isDurablePrimitiveCall(node.expression)
				if (primitiveCall) {
					this.addDiagnostic(
						node,
						'warning',
						`Durable primitive '${primitiveCall.primitiveName}' was called without 'await'. This will not pause the workflow and is likely an error.`,
					)
					return this.state.getCursor()
				}
			}
			return this.visit(node.expression)
		} else if (ts.isVariableStatement(node)) {
			for (const declaration of node.declarationList.declarations) {
				if (declaration.initializer) {
					this.visit(declaration.initializer)
				}
			}
			return this.state.getCursor()
		} else if (ts.isAwaitExpression(node)) {
			handleAwaitExpression(this, node)
			return this.state.getCursor()
		} else if (ts.isWhileStatement(node)) {
			return handleWhileStatement(this, node)
		} else if (ts.isDoStatement(node)) {
			return handleDoStatement(this, node)
		} else if (ts.isForOfStatement(node)) {
			return handleForOfStatement(this, node)
		} else if (ts.isIfStatement(node)) {
			return handleIfStatement(this, node)
		} else if (ts.isSwitchStatement(node)) {
			return handleSwitchStatement(this, node)
		} else if (ts.isTryStatement(node)) {
			return handleTryStatement(this, node)
		} else if (ts.isReturnStatement(node)) {
			// Visit the return expression first (e.g., `return await step()`)
			if (node.expression) {
				this.visit(node.expression)
			}
			// Terminate further edge propagation from this point.
			this.state.setCursor(null)
			return null
		} else if (ts.isThrowStatement(node)) {
			const cursor = this.state.getCursor()
			const errorNodeName = 'error'
			const errorCount = this.state.incrementUsageCount(errorNodeName)
			const errorNodeId = `${errorNodeName}_${errorCount}`
			const errorNode: NodeDefinition = {
				id: errorNodeId,
				uses: 'error',
				_sourceLocation: this.getSourceLocation(node),
			}
			this.state.addNode(errorNode)
			if (cursor) {
				this.state.addEdge({
					source: cursor,
					target: errorNodeId,
					_sourceLocation: this.getSourceLocation(node),
				})
			}
			this.state.setCursor(null)
			return null
		} else if (ts.isLabeledStatement(node)) {
			this.addDiagnostic(
				node,
				'warning',
				`Labeled statements are not fully supported in flow functions. The label '${node.label.text}' will be ignored.`,
			)
			return this.visit(node.statement)
		} else if (ts.isContinueStatement(node)) {
			const cursor = this.state.getCursor()
			const loopScope = this.state.getCurrentLoopScope()
			if (loopScope && cursor) {
				this.state.addEdge({
					source: cursor,
					target: loopScope.controllerId,
					_sourceLocation: this.getSourceLocation(node),
				})
			} else {
				this.addDiagnostic(
					node,
					'error',
					`continue statement can only be used inside a loop.`,
				)
			}
			this.state.setCursor(null)
			return null
		} else if (ts.isBreakStatement(node)) {
			const cursor = this.state.getCursor()
			const loopScope = this.state.getCurrentLoopScope()
			if (loopScope && cursor) {
				this.state.addEdge({
					source: cursor,
					target: loopScope.breakTargetId,
					_sourceLocation: this.getSourceLocation(node),
				})
			} else {
				const switchBreakTarget = this.state.getCurrentSwitchBreakTarget()
				if (switchBreakTarget && cursor) {
					this.state.addEdge({
						source: cursor,
						target: switchBreakTarget,
						_sourceLocation: this.getSourceLocation(node),
					})
				} else {
					this.addDiagnostic(
						node,
						'error',
						`break statement can only be used inside a loop or switch statement.`,
					)
				}
			}
			this.state.setCursor(null)
			return null
		} else if (ts.isBlock(node)) {
			return this.traverse(node)
		} else {
			return this.state.getCursor()
		}
	}

	/**
	 * Checks if the flow function is a generator — emit a clear error if so.
	 */
	private checkGeneratorFunction(): void {
		if (this.functionNode.asteriskToken) {
			this.addDiagnostic(
				this.functionNode,
				'error',
				`Generator functions (function*) cannot be used as flow functions. ` +
					`State generator functions cannot be safely represented as declarative graph-based blueprints. Use an async function instead.`,
			)
		}
	}

	addDiagnostic(node: ts.Node, severity: 'error' | 'warning' | 'info', message: string): void {
		const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
		this.diagnostics.push({
			file: this.sourceFile.fileName,
			line: line + 1,
			column: character + 1,
			message,
			severity,
		})
	}

	/**
	 * Checks if a call expression is calling a durable primitive from 'flowcraft/sdk'
	 */
	isDurablePrimitiveCall(callExpression: ts.CallExpression): { primitiveName: string } | null {
		const callee = callExpression.expression
		if (!ts.isIdentifier(callee)) {
			return null
		}

		let symbol: ts.Symbol | undefined
		try {
			symbol = this.typeChecker.getSymbolAtLocation(callee)
		} catch {
			return null
		}
		if (!symbol) {
			return null
		}

		// Check the original symbol's declarations FIRST (these are the import specifiers)
		// before alias resolution. If the symbol IS an alias, we still check the original
		// symbol's declarations since the import specifier is on the non-aliased symbol.
		const originalDeclarations = symbol.getDeclarations()
		if (originalDeclarations) {
			for (const declaration of originalDeclarations) {
				if (ts.isImportSpecifier(declaration)) {
					const importDeclaration = declaration.parent.parent.parent
					if (
						ts.isImportDeclaration(importDeclaration) &&
						ts.isStringLiteral(importDeclaration.moduleSpecifier)
					) {
						const moduleSpecifier = importDeclaration.moduleSpecifier.text
						if (moduleSpecifier === 'flowcraft/sdk') {
							const primitiveName = declaration.propertyName
								? declaration.propertyName.text
								: declaration.name.text
							if (
								['sleep', 'waitForEvent', 'createWebhook'].includes(primitiveName)
							) {
								return { primitiveName }
							}
						}
					}
				}
			}
		}

		// Also check the aliased symbol's declarations for re-exports
		let aliasedSymbol: ts.Symbol | undefined
		try {
			aliasedSymbol =
				symbol.flags & ts.SymbolFlags.Alias
					? this.typeChecker.getAliasedSymbol(symbol)
					: undefined
		} catch {
			aliasedSymbol = undefined
		}

		if (aliasedSymbol) {
			const aliasedDeclarations = aliasedSymbol.getDeclarations()
			if (aliasedDeclarations) {
				for (const declaration of aliasedDeclarations) {
					if (ts.isImportSpecifier(declaration)) {
						const importDeclaration = declaration.parent.parent.parent
						if (
							ts.isImportDeclaration(importDeclaration) &&
							ts.isStringLiteral(importDeclaration.moduleSpecifier)
						) {
							const moduleSpecifier = importDeclaration.moduleSpecifier.text
							if (moduleSpecifier === 'flowcraft/sdk') {
								const primitiveName = declaration.propertyName
									? declaration.propertyName.text
									: declaration.name.text
								if (
									['sleep', 'waitForEvent', 'createWebhook'].includes(
										primitiveName,
									)
								) {
									return { primitiveName }
								}
							}
						}
					}
				}
			}
		}

		return null
	}

	getSourceLocation(node: ts.Node): import('flowcraft').SourceLocation {
		const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
		return {
			file: this.sourceFile.fileName,
			line: line + 1,
			column: character + 1,
		}
	}

	checkFunctionCallTypes(callExpr: ts.CallExpression): void {
		const funcType = this.typeChecker.getTypeAtLocation(callExpr.expression)
		if (!funcType) return

		const signatures = this.typeChecker.getSignaturesOfType(funcType, ts.SignatureKind.Call)
		if (signatures.length === 0) return

		const signature = signatures[0]
		const parameters = signature.getParameters()
		const args = callExpr.arguments

		for (let i = 0; i < Math.min(parameters.length, args.length); i++) {
			const param = parameters[i]
			const arg = args[i]

			if (!param.valueDeclaration) continue
			const paramType = this.typeChecker.getTypeOfSymbolAtLocation(
				param,
				param.valueDeclaration,
			)
			if (!paramType) continue

			const argType = this.typeChecker.getTypeAtLocation(arg)
			if (!argType) continue

			const isAssignable = this.typeChecker.isTypeAssignableTo(argType, paramType)
			if (!isAssignable) {
				const paramName = param.getName()
				const argTypeStr = this.typeChecker.typeToString(argType)
				const paramTypeStr = this.typeChecker.typeToString(paramType)
				const funcName = callExpr.expression.getText()

				this.addDiagnostic(
					arg,
					'error',
					`Type error in call to '${funcName}': argument of type '${argTypeStr}' is not assignable to parameter '${paramName}' of type '${paramTypeStr}'`,
				)
			}
		}
	}

	isPromiseParallelCall(
		node: ts.CallExpression,
	): false | { method: 'all' | 'allSettled' | 'race' } {
		if (ts.isPropertyAccessExpression(node.expression)) {
			const propAccess = node.expression
			const objectText = propAccess.expression.getText()
			const propertyText = propAccess.name.text
			if (
				objectText === 'Promise' &&
				(propertyText === 'all' || propertyText === 'allSettled' || propertyText === 'race')
			) {
				return { method: propertyText as 'all' | 'allSettled' | 'race' }
			}
		}
		return false
	}
}
