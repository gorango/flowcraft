import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import ts from 'typescript'
import type { Compiler } from './compiler'
import { CompilerState } from './compiler-state'
import { handleAwaitExpression } from './visitors/handle-await-expression'
import { handleForOfStatement } from './visitors/handle-for-of-statement'
import { handleIfStatement } from './visitors/handle-if-statement'
import { handleTryStatement } from './visitors/handle-try-statement'
import { handleWhileStatement } from './visitors/handle-while-statement'

export class FlowAnalyzer {
	registry: Record<string, { importPath: string; exportName: string }> = {}
	private diagnostics: import('./types').CompilationDiagnostic[] = []
	public state: CompilerState

	constructor(
		public compiler: Compiler,
		public sourceFile: ts.SourceFile,
		public functionNode: ts.FunctionDeclaration,
		public typeChecker: ts.TypeChecker,
	) {
		this.state = new CompilerState()
	}

	analyze(): {
		blueprint: WorkflowBlueprint
		registry: Record<string, { importPath: string; exportName: string }>
		diagnostics: import('./types').CompilationDiagnostic[]
	} {
		if (this.functionNode.body) {
			this.traverse(this.functionNode.body)
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
		const blueprint: WorkflowBlueprint = {
			id: this.functionNode.name?.text || 'anonymous',
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
		} else if (ts.isForOfStatement(node)) {
			return handleForOfStatement(this, node)
		} else if (ts.isIfStatement(node)) {
			return handleIfStatement(this, node)
		} else if (ts.isTryStatement(node)) {
			return handleTryStatement(this, node)
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
				this.addDiagnostic(node, 'error', `continue statement can only be used inside a loop.`)
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
				this.addDiagnostic(node, 'error', `break statement can only be used inside a loop.`)
			}
			this.state.setCursor(null)
			return null
		} else {
			return this.state.getCursor()
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
	private isDurablePrimitiveCall(callExpression: ts.CallExpression): { primitiveName: string } | null {
		const callee = callExpression.expression
		if (!ts.isIdentifier(callee)) {
			return null
		}

		const symbol = this.typeChecker.getSymbolAtLocation(callee)
		if (!symbol) {
			return null
		}

		const originalSymbol = symbol.flags & ts.SymbolFlags.Alias ? this.typeChecker.getAliasedSymbol(symbol) : symbol

		const declarations = originalSymbol.getDeclarations()
		if (!declarations || declarations.length === 0) {
			return null
		}

		for (const declaration of declarations) {
			if (ts.isImportSpecifier(declaration)) {
				const importDeclaration = declaration.parent.parent.parent
				if (ts.isImportDeclaration(importDeclaration) && ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
					const moduleSpecifier = importDeclaration.moduleSpecifier.text
					if (moduleSpecifier === 'flowcraft/sdk' || moduleSpecifier === '../../../flowcraft/dist/sdk') {
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
			const paramType = this.typeChecker.getTypeOfSymbolAtLocation(param, param.valueDeclaration)
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

	isPromiseAllCall(node: ts.CallExpression): boolean {
		if (ts.isPropertyAccessExpression(node.expression)) {
			const propAccess = node.expression
			const objectText = propAccess.expression.getText()
			const propertyText = propAccess.name.text
			return objectText === 'Promise' && propertyText === 'all'
		}
		return false
	}
}
