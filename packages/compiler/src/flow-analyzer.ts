import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import * as ts from 'typescript'
import type { Compiler } from './compiler'
import type { CompilerState } from './types'

export class FlowAnalyzer {
	private registry: Record<string, { importPath: string; exportName: string }> = {}
	private diagnostics: import('./types').CompilationDiagnostic[] = []
	private state: CompilerState = {
		cursor: null,
		nodes: [],
		edges: [],
		scopes: [],
		pendingEdges: [],
		fallbackScope: null,
		usageCounts: new Map(),
		pendingBranches: null,
		pendingForkEdges: [],
	}

	constructor(
		private compiler: Compiler,
		private sourceFile: ts.SourceFile,
		private functionNode: ts.FunctionDeclaration,
		private typeChecker: ts.TypeChecker,
	) {}

	analyze(): {
		blueprint: WorkflowBlueprint
		registry: Record<string, { importPath: string; exportName: string }>
		diagnostics: import('./types').CompilationDiagnostic[]
	} {
		// Push initial scope
		this.state.scopes.push({ variables: new Map() })
		if (this.functionNode.body) {
			this.traverse(this.functionNode.body)
		}
		// If no nodes, add a start node
		if (this.state.nodes.length === 0) {
			const startNode: NodeDefinition = {
				id: 'start',
				uses: 'start',
				_sourceLocation: this.getSourceLocation(this.functionNode),
			}
			this.state.nodes.unshift(startNode)
			this.state.cursor = 'start'
		}
		const blueprint: WorkflowBlueprint = {
			id: this.functionNode.name?.text || 'anonymous',
			nodes: this.state.nodes,
			edges: this.state.edges,
		}
		return { blueprint, registry: this.registry, diagnostics: this.diagnostics }
	}

	private traverse(node: ts.Node): string | null {
		let lastCursor: string | null = null
		ts.forEachChild(node, (child) => {
			this.visit(child)
			lastCursor = this.state.cursor
		})
		return lastCursor
	}

	private visit(node: ts.Node): string | null {
		if (ts.isAwaitExpression(node)) {
			this.visitAwaitExpression(node)
			return this.state.cursor
		} else if (ts.isWhileStatement(node)) {
			return this.visitWhileStatement(node)
		} else if (ts.isForOfStatement(node)) {
			return this.visitForOfStatement(node)
		} else if (ts.isIfStatement(node)) {
			return this.visitIfStatement(node)
		} else if (ts.isTryStatement(node)) {
			return this.visitTryStatement(node)
		} else if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
			this.addDiagnostic(node, 'error', `Break and continue statements are not supported in flow functions.`)
			return this.state.cursor
		} else {
			return this.state.cursor // Unknown type
		}
	}

	private addDiagnostic(node: ts.Node, severity: 'error' | 'warning' | 'info', message: string): void {
		const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
		this.diagnostics.push({
			file: this.sourceFile.fileName,
			line: line + 1,
			column: character + 1,
			message,
			severity,
		})
	}

	private getSourceLocation(node: ts.Node): import('flowcraft').SourceLocation {
		const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
		return {
			file: this.sourceFile.fileName,
			line: line + 1,
			column: character + 1,
		}
	}

	private _addNodeAndWire(nodeDef: NodeDefinition, node: ts.Node): void {
		this.state.nodes.push(nodeDef)
		if (this.state.pendingBranches) {
			for (const end of this.state.pendingBranches.ends) {
				this.state.edges.push({
					source: end,
					target: nodeDef.id,
					_sourceLocation: this.getSourceLocation(node),
				})
			}
			nodeDef.config = {
				...nodeDef.config,
				joinStrategy: this.state.pendingBranches.joinStrategy as 'all' | 'any',
			}
			this.state.pendingBranches = null
		}
		if (this.state.pendingForkEdges.length > 0) {
			for (const forkEdge of this.state.pendingForkEdges) {
				this.state.edges.push({
					source: forkEdge.source,
					target: nodeDef.id,
					condition: forkEdge.condition,
					_sourceLocation: this.getSourceLocation(node),
				})
			}
			this.state.pendingForkEdges = []
		}
		if (this.state.cursor) {
			const edge: any = {
				source: this.state.cursor,
				target: nodeDef.id,
				_sourceLocation: this.getSourceLocation(node),
			}
			// If source is a loop-controller, add break action
			const sourceNode = this.state.nodes.find((n) => n.id === this.state.cursor)
			if (sourceNode && sourceNode.uses === 'loop-controller') {
				edge.action = 'break'
			}
			this.state.edges.push(edge)
		}
		this.state.cursor = nodeDef.id

		// Map variable to node output if it's a VariableDeclaration
		const parent = node.parent
		if (ts.isVariableDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
			const varName = parent.name.text
			const returnType = this.typeChecker.getTypeAtLocation(node)
			this.state.scopes[this.state.scopes.length - 1].variables.set(varName, {
				nodeId: nodeDef.id,
				type: returnType,
			})
		}
	}

	private visitAwaitExpression(node: ts.AwaitExpression): void {
		const callee = node.expression
		if (ts.isCallExpression(callee)) {
			// Check for Promise.all parallel execution
			if (this.isPromiseAllCall(callee)) {
				this.visitPromiseAll(callee, node)
				return
			}

			// Check if it's context.get or context.set, ignore
			if (ts.isPropertyAccessExpression(callee.expression)) {
				const propAccess = callee.expression
				if (propAccess.expression.getText() === 'context') {
					return
				}
			}

			// Perform type checking for function calls
			this.checkFunctionCallTypes(callee)

			// Handle the await call
			this.handleAwaitCall(callee, node)
		}
	}

	private handleAwaitCall(callee: ts.CallExpression, node: ts.AwaitExpression): void {
		const symbol = this.typeChecker.getSymbolAtLocation(callee.expression)
		if (symbol) {
			let originalSymbol = symbol
			if (symbol.flags & ts.SymbolFlags.Alias) {
				originalSymbol = this.typeChecker.getAliasedSymbol(symbol)
			}
			if (originalSymbol?.valueDeclaration) {
				const decl = originalSymbol.valueDeclaration
				const filePath = decl.getSourceFile().fileName
				const fileAnalysis = this.compiler.fileCache.get(filePath)
				if (fileAnalysis) {
					const exportName = originalSymbol.name
					const exportInfo = fileAnalysis.exports.get(exportName)
					if (exportInfo) {
						// This is an exported function
						let nodeDef: NodeDefinition
						const count = (this.state.usageCounts.get(exportName) || 0) + 1
						this.state.usageCounts.set(exportName, count)
						if (exportInfo.type === 'step') {
							nodeDef = {
								id: `${exportName}_${count}`,
								uses: exportName,
								_sourceLocation: this.getSourceLocation(node),
							}
							if (this.state.fallbackScope) {
								nodeDef.config = { fallback: this.state.fallbackScope }
							}
							this.registry[exportName] = { importPath: filePath, exportName }
						} else if (exportInfo.type === 'flow') {
							nodeDef = {
								id: `${exportName}_${count}`,
								uses: 'subflow',
								params: { blueprintId: exportName },
								_sourceLocation: this.getSourceLocation(node),
							}
							if (this.state.fallbackScope) {
								nodeDef.config = { fallback: this.state.fallbackScope }
							}
						} else {
							return // Unknown type
						}
						this._addNodeAndWire(nodeDef, node)
					} else if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
						// This is a local function declaration in the same file, treat as step
						const count = (this.state.usageCounts.get(exportName) || 0) + 1
						this.state.usageCounts.set(exportName, count)

						const nodeDef: NodeDefinition = {
							id: `${exportName}_${count}`,
							uses: exportName,
							_sourceLocation: this.getSourceLocation(node),
						}
						if (this.state.fallbackScope) {
							nodeDef.config = { fallback: this.state.fallbackScope }
						}
						this.registry[exportName] = { importPath: filePath, exportName }
						this._addNodeAndWire(nodeDef, node)
					}
				}
			}
		}
	}

	private visitWhileStatement(node: ts.WhileStatement): string | null {
		// Check for break/continue in the loop body
		ts.forEachChild(node.statement, (child) => {
			if (ts.isBreakStatement(child) || ts.isContinueStatement(child)) {
				this.addDiagnostic(child, 'error', `Break and continue statements are not supported in flow functions.`)
			}
		})

		// Push scope for loop body
		this.state.scopes.push({ variables: new Map() })

		const exportName = 'loop-controller'
		const count = (this.state.usageCounts.get(exportName) || 0) + 1
		this.state.usageCounts.set(exportName, count)
		const controllerId = `${exportName}_${count}`
		const controllerNode: NodeDefinition = {
			id: controllerId,
			uses: 'loop-controller',
			params: { condition: node.expression.getText() || 'true' },
			config: { joinStrategy: 'any' },
			_sourceLocation: this.getSourceLocation(node),
		}
		this.state.nodes.push(controllerNode)
		if (this.state.cursor) {
			this.state.edges.push({
				source: this.state.cursor,
				target: controllerId,
				_sourceLocation: this.getSourceLocation(node),
			})
		}
		const _prevCursor = this.state.cursor
		this.state.cursor = controllerId

		// Traverse the body and find first and last nodes
		const nodesBeforeBody = this.state.nodes.length
		const lastInBody = this.traverse(node.statement)
		const firstInBody = this.state.nodes.length > nodesBeforeBody ? this.state.nodes[nodesBeforeBody].id : null

		// Add continue edge from controller to first node in body
		if (firstInBody) {
			this.state.edges.push({
				source: controllerId,
				target: firstInBody,
				action: 'continue',
				_sourceLocation: this.getSourceLocation(node),
			})
		}

		// Add loopback edge from last in body to controller
		if (lastInBody) {
			this.state.edges.push({ source: lastInBody, target: controllerId, _sourceLocation: this.getSourceLocation(node) })
		}

		// Pop scope
		this.state.scopes.pop()

		// The exit path is the current cursor (controller), next nodes will connect with break
		this.state.cursor = controllerId
		return this.state.cursor
	}

	private visitForOfStatement(node: ts.ForOfStatement): string | null {
		// De-sugar for...of into a while loop pattern
		// Create iterator variable: const __iterator = items[Symbol.iterator]()
		// Create result variable: let __result
		// While condition: !(__result = __iterator.next()).done
		// In body: const item = __result.value; ...original body...

		// Check for break/continue in the loop body
		ts.forEachChild(node.statement, (child) => {
			if (ts.isBreakStatement(child) || ts.isContinueStatement(child)) {
				this.addDiagnostic(child, 'error', `Break and continue statements are not supported in flow functions.`)
			}
		})

		// Push scope for loop body
		this.state.scopes.push({ variables: new Map() })

		const exportName = 'loop-controller'
		const count = (this.state.usageCounts.get(exportName) || 0) + 1
		this.state.usageCounts.set(exportName, count)
		const controllerId = `${exportName}_${count}`
		const controllerNode: NodeDefinition = {
			id: controllerId,
			uses: 'loop-controller',
			params: { condition: `${node.expression.getText()}.length > 0` }, // Simplified condition for loop controller
			config: { joinStrategy: 'any' },
			_sourceLocation: this.getSourceLocation(node),
		}
		this.state.nodes.push(controllerNode)
		if (this.state.cursor) {
			this.state.edges.push({
				source: this.state.cursor,
				target: controllerId,
				_sourceLocation: this.getSourceLocation(node),
			})
		}
		const _prevCursor = this.state.cursor
		this.state.cursor = controllerId

		// Traverse the body and find first and last nodes
		const nodesBeforeBody = this.state.nodes.length
		const lastInBody = this.traverse(node.statement)
		const firstInBody = this.state.nodes.length > nodesBeforeBody ? this.state.nodes[nodesBeforeBody].id : null

		// Add continue edge from controller to first node in body
		if (firstInBody) {
			this.state.edges.push({
				source: controllerId,
				target: firstInBody,
				action: 'continue',
				_sourceLocation: this.getSourceLocation(node),
			})
		}

		// Add loopback edge from last in body to controller
		if (lastInBody) {
			this.state.edges.push({ source: lastInBody, target: controllerId, _sourceLocation: this.getSourceLocation(node) })
		}

		// Pop scope
		this.state.scopes.pop()

		// The exit path is the current cursor (controller), next nodes will connect with break
		this.state.cursor = controllerId
		return this.state.cursor
	}

	private visitIfStatement(node: ts.IfStatement): string | null {
		let forkNodeId = this.state.cursor
		const condition = node.expression.getText()

		// If no fork point, create a start node
		if (!forkNodeId) {
			const startNode: NodeDefinition = {
				id: 'start',
				uses: 'start',
			}
			this.state.nodes.unshift(startNode)
			forkNodeId = 'start'
		}

		// Push scope for if block
		this.state.scopes.push({ variables: new Map() })

		// Traverse if block and find first and last nodes
		const prevCursor = this.state.cursor
		this.state.cursor = null // Prevent unconditional edges in branch
		const nodesBeforeIf = this.state.nodes.length
		const lastInIf = this.traverse(node.thenStatement)
		const firstInIf = this.state.nodes.length > nodesBeforeIf ? this.state.nodes[nodesBeforeIf].id : null
		this.state.cursor = prevCursor // Restore

		// Pop scope
		this.state.scopes.pop()

		// Add conditional edge from fork to first in if
		if (firstInIf && forkNodeId) {
			this.state.edges.push({
				source: forkNodeId,
				target: firstInIf,
				condition,
				_sourceLocation: this.getSourceLocation(node),
			})
		}

		let firstInElse: string | null = null
		let lastInElse: string | null = null
		if (node.elseStatement) {
			// Push scope for else block
			this.state.scopes.push({ variables: new Map() })

			// Traverse else block and find first and last nodes
			this.state.cursor = null // Prevent unconditional edges in branch
			const nodesBeforeElse = this.state.nodes.length
			lastInElse = this.traverse(node.elseStatement)
			firstInElse = this.state.nodes.length > nodesBeforeElse ? this.state.nodes[nodesBeforeElse].id : null
			this.state.cursor = prevCursor // Restore

			// Pop scope
			this.state.scopes.pop()

			// Add conditional edge from fork to first in else
			if (firstInElse && forkNodeId) {
				this.state.edges.push({
					source: forkNodeId,
					target: firstInElse,
					condition: `!(${condition})`,
					_sourceLocation: this.getSourceLocation(node),
				})
			}
		} else {
			// If no else, add pending fork edge for the negated condition to successor
			if (forkNodeId) {
				this.state.pendingForkEdges.push({ source: forkNodeId, condition: `!(${condition})` })
			}
		}

		// Set pending branches for the successor
		const ends: string[] = []
		if (lastInIf) ends.push(lastInIf)
		else if (firstInIf) ends.push(firstInIf)
		if (lastInElse) ends.push(lastInElse)
		else if (firstInElse) ends.push(firstInElse)
		this.state.pendingBranches = { ends, joinStrategy: 'any' }

		return null
	}

	private visitTryStatement(node: ts.TryStatement): string | null {
		// Check for finally block
		if (node.finallyBlock) {
			this.addDiagnostic(node.finallyBlock, 'error', `Finally blocks are not supported in flow functions.`)
		}

		// Pre-scan catch block to find fallback node
		let fallbackNodeId: string | null = null
		if (node.catchClause) {
			const savedUsageCounts = new Map(this.state.usageCounts)
			const nodesBeforeCatch = this.state.nodes.length
			this.traverse(node.catchClause.block)
			fallbackNodeId = this.state.nodes.length > nodesBeforeCatch ? this.state.nodes[nodesBeforeCatch].id : null
			// Reset nodes and cursor since this was just a pre-scan
			this.state.nodes.splice(nodesBeforeCatch)
			this.state.cursor = null // Reset cursor
			this.state.usageCounts = savedUsageCounts
		}

		// Set fallback scope
		this.state.fallbackScope = fallbackNodeId

		// Traverse try block
		const lastInTry = this.traverse(node.tryBlock)

		// Exit fallback scope
		this.state.fallbackScope = null

		// Traverse catch block
		let lastInCatch: string | null = null
		if (node.catchClause) {
			lastInCatch = this.traverse(node.catchClause.block)
		}

		// Set pending branches for the successor
		const ends: string[] = []
		if (lastInTry) ends.push(lastInTry)
		if (lastInCatch) ends.push(lastInCatch)
		this.state.pendingBranches = { ends, joinStrategy: 'any' }

		return null
	}

	private checkFunctionCallTypes(callExpr: ts.CallExpression): void {
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

	private isPromiseAllCall(node: ts.CallExpression): boolean {
		// Check if it's Promise.all([...])
		if (ts.isPropertyAccessExpression(node.expression)) {
			const propAccess = node.expression
			const objectText = propAccess.expression.getText()
			const propertyText = propAccess.name.text
			return objectText === 'Promise' && propertyText === 'all'
		}
		return false
	}

	private visitPromiseAll(node: ts.CallExpression, _awaitNode: ts.AwaitExpression): string | null {
		// Get the array argument
		const arrayArg = node.arguments[0]
		if (!arrayArg || !ts.isArrayLiteralExpression(arrayArg)) {
			this.addDiagnostic(node, 'error', 'Promise.all requires an array literal argument')
			return this.state.cursor
		}

		// Store the scatter point (current cursor before Promise.all)
		const scatterPoint = this.state.cursor

		// Process each parallel call
		const parallelNodeIds: string[] = []
		for (const element of arrayArg.elements) {
			if (ts.isCallExpression(element)) {
				// This is a call expression in the array
				const nodeId = this.processParallelCall(element)
				if (nodeId) {
					parallelNodeIds.push(nodeId)
					// Create edge from scatter point to parallel node
					if (scatterPoint) {
						this.state.edges.push({
							source: scatterPoint,
							target: nodeId,
							_sourceLocation: this.getSourceLocation(node),
						})
					}
				}
			}
		}

		// Set pending branches for the gather node (which will be processed by the next await)
		this.state.pendingBranches = { ends: parallelNodeIds, joinStrategy: 'all' }

		// The cursor remains at the scatter point; the next await will be the gather
		return this.state.cursor
	}

	private processParallelCall(callNode: ts.CallExpression): string | null {
		// Process a single call expression within Promise.all
		const symbol = this.typeChecker.getSymbolAtLocation(callNode.expression)
		if (symbol) {
			let originalSymbol = symbol
			if (symbol.flags & ts.SymbolFlags.Alias) {
				originalSymbol = this.typeChecker.getAliasedSymbol(symbol)
			}
			if (originalSymbol?.valueDeclaration) {
				const decl = originalSymbol.valueDeclaration
				const filePath = decl.getSourceFile().fileName
				const fileAnalysis = this.compiler.fileCache.get(filePath)
				if (fileAnalysis) {
					const exportName = originalSymbol.name
					const exportInfo = fileAnalysis.exports.get(exportName)
					if (exportInfo) {
						// This is an exported function (from another file or this file)
						const count = (this.state.usageCounts.get(exportName) || 0) + 1
						this.state.usageCounts.set(exportName, count)

						let nodeDef: NodeDefinition
						if (exportInfo.type === 'step') {
							nodeDef = {
								id: `${exportName}_parallel_${count}`,
								uses: exportName,
								_sourceLocation: this.getSourceLocation(callNode),
							}
							this.registry[exportName] = { importPath: filePath, exportName }
						} else if (exportInfo.type === 'flow') {
							nodeDef = {
								id: `${exportName}_parallel_${count}`,
								uses: 'subflow',
								params: { blueprintId: exportName },
								_sourceLocation: this.getSourceLocation(callNode),
							}
						} else {
							return null
						}

						this.state.nodes.push(nodeDef)
						return nodeDef.id
					} else if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
						// This is a local function declaration in the same file, treat as step
						const count = (this.state.usageCounts.get(exportName) || 0) + 1
						this.state.usageCounts.set(exportName, count)

						const nodeDef: NodeDefinition = {
							id: `${exportName}_${count}`,
							uses: exportName,
							_sourceLocation: this.getSourceLocation(callNode),
						}
						if (this.state.fallbackScope) {
							nodeDef.config = { fallback: this.state.fallbackScope }
						}
						this.registry[exportName] = { importPath: filePath, exportName }
						this.state.nodes.push(nodeDef)
						return nodeDef.id
					}
				}
			}
		}
		return null
	}
}
