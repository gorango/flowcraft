import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import * as ts from 'typescript'
import type { Compiler } from './compiler'
import { CompilerState } from './compiler-state'
import { handleWhileStatement } from './visitors/handle-while-statement'
import { handleForOfStatement } from './visitors/handle-for-of-statement'
import { handleIfStatement } from './visitors/handle-if-statement'
import { handleTryStatement } from './visitors/handle-try-statement'
import { handleAwaitExpression } from './visitors/handle-await-expression'

export class FlowAnalyzer {
	registry: Record<string, { importPath: string; exportName: string }> = {}
	private diagnostics: import('./types').CompilationDiagnostic[] = []
	private state: CompilerState

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
		// If no nodes, add a start node
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
			// Handle expression statements by visiting their expression
			return this.visit(node.expression)
		} else if (ts.isVariableStatement(node)) {
			// Handle variable statements by visiting their declarations
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
		} else if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
			this.addDiagnostic(node, 'error', `Break and continue statements are not supported in flow functions.`)
			return this.state.getCursor()
		} else {
			return this.state.getCursor() // Unknown type
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

	getSourceLocation(node: ts.Node): import('flowcraft').SourceLocation {
		const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
		return {
			file: this.sourceFile.fileName,
			line: line + 1,
			column: character + 1,
		}
	}

	checkFunctionCallTypes(callExpr: ts.CallExpression): void {
		// Get the type of the function being called
		const funcType = this.typeChecker.getTypeAtLocation(callExpr.expression)
		if (!funcType) return

		// Get the call signatures
		const signatures = this.typeChecker.getSignaturesOfType(funcType, ts.SignatureKind.Call)
		if (signatures.length === 0) return

		// Use the first signature (most common case)
		const signature = signatures[0]
		const parameters = signature.getParameters()
		const args = callExpr.arguments

		// Check each argument against its corresponding parameter
		for (let i = 0; i < Math.min(parameters.length, args.length); i++) {
			const param = parameters[i]
			const arg = args[i]

			// Get the expected parameter type
			if (!param.valueDeclaration) continue
			const paramType = this.typeChecker.getTypeOfSymbolAtLocation(param, param.valueDeclaration)
			if (!paramType) continue

			// Get the actual argument type
			const argType = this.typeChecker.getTypeAtLocation(arg)
			if (!argType) continue

			// Check if the argument type is assignable to the parameter type
			const isAssignable = this.typeChecker.isTypeAssignableTo(argType, paramType)

			if (!isAssignable) {
				// Add a diagnostic for type mismatch
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
		// Check if it's Promise.all([...])
		if (ts.isPropertyAccessExpression(node.expression)) {
			const propAccess = node.expression
			const objectText = propAccess.expression.getText()
			const propertyText = propAccess.name.text
			return objectText === 'Promise' && propertyText === 'all'
		}
		return false
	}
}
