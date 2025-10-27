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
		this.traverse(this.functionNode.body!)
		// If no nodes, add a start node
		if (this.state.nodes.length === 0) {
			const startNode: NodeDefinition = {
				id: 'start',
				uses: 'start',
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

	private findFirstAwait(node: ts.Node): string | null {
		let first: string | null = null
		const visitor = (n: ts.Node) => {
			if (first) return
			if (ts.isAwaitExpression(n)) {
				this.visit(n)
				first = this.state.cursor
			} else {
				ts.forEachChild(n, visitor)
			}
		}
		visitor(node)
		return first
	}

	private visit(node: ts.Node): string | null {
		if (ts.isAwaitExpression(node)) {
			this.visitAwaitExpression(node)
			return this.state.cursor
		} else if (ts.isWhileStatement(node)) {
			return this.visitWhileStatement(node)
		} else if (ts.isIfStatement(node)) {
			return this.visitIfStatement(node)
		} else if (ts.isTryStatement(node)) {
			return this.visitTryStatement(node)
		} else if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
			this.addDiagnostic(node, 'error', `Break and continue statements are not supported in flow functions.`)
			return this.state.cursor
		} else {
			return this.traverse(node)
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

	private visitAwaitExpression(node: ts.AwaitExpression): string | null {
		const callee = node.expression
		if (ts.isCallExpression(callee)) {
			// Check for Promise.all parallel execution
			if (this.isPromiseAllCall(callee)) {
				return this.visitPromiseAll(callee, node)
			}

			// Check if it's context.get or context.set, ignore
			if (ts.isPropertyAccessExpression(callee.expression)) {
				const propAccess = callee.expression
				if (propAccess.expression.getText() === 'context') {
					return this.state.cursor
				}
			}

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
							let nodeDef: NodeDefinition
							const count = (this.state.usageCounts.get(exportName) || 0) + 1
							this.state.usageCounts.set(exportName, count)
							if (exportInfo.type === 'step') {
								nodeDef = {
									id: `${exportName}_${count}`,
									uses: exportName,
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
								}
								if (this.state.fallbackScope) {
									nodeDef.config = { fallback: this.state.fallbackScope }
								}
							} else {
								return this.state.cursor // Unknown type
							}
							this.state.nodes.push(nodeDef)
							if (this.state.cursor) {
								const edge: any = { source: this.state.cursor, target: nodeDef.id }
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
					}
				}
				return this.state.cursor
			}

			return this.state.cursor
		}

		return null
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
		}
		this.state.nodes.push(controllerNode)
		if (this.state.cursor) {
			this.state.edges.push({ source: this.state.cursor, target: controllerId })
		}
		const _prevCursor = this.state.cursor
		this.state.cursor = controllerId

		// Traverse the body and capture the first node
		const firstInBody = this.findFirstAwait(node.statement)
		const lastInBody = this.traverse(node.statement)

		// Add continue edge from controller to first node in body
		if (firstInBody) {
			this.state.edges.push({ source: controllerId, target: firstInBody, action: 'continue' })
		}

		// Add loopback edge from last in body to controller
		if (lastInBody) {
			this.state.edges.push({ source: lastInBody, target: controllerId })
		}

		// Pop scope
		this.state.scopes.pop()

		// The exit path is the current cursor (controller), next nodes will connect with break
		this.state.cursor = controllerId
		return this.state.cursor
	}

	private visitIfStatement(node: ts.IfStatement): string | null {
		const forkNodeId = this.state.cursor
		const condition = node.expression.getText()

		// Create merge node
		const mergeExportName = 'merge'
		const mergeCount = (this.state.usageCounts.get(mergeExportName) || 0) + 1
		this.state.usageCounts.set(mergeExportName, mergeCount)
		const mergeId = `${mergeExportName}_${mergeCount}`
		const mergeNode: NodeDefinition = {
			id: mergeId,
			uses: 'merge',
			config: { joinStrategy: 'any' },
		}
		this.state.nodes.push(mergeNode)

		// Push scope for if block
		this.state.scopes.push({ variables: new Map() })

		// Traverse if block and capture first node
		const firstInIf = this.findFirstAwait(node.thenStatement)
		const lastInIf = this.traverse(node.thenStatement)

		// Pop scope
		this.state.scopes.pop()

		// Add conditional edge from fork to first in if
		if (firstInIf && forkNodeId) {
			this.state.edges.push({ source: forkNodeId, target: firstInIf, condition })
		}

		// Wire if branch to merge
		if (lastInIf) {
			this.state.edges.push({ source: lastInIf, target: mergeId })
		} else if (firstInIf) {
			this.state.edges.push({ source: firstInIf, target: mergeId })
		}

		let firstInElse: string | null = null
		let lastInElse: string | null = null
		if (node.elseStatement) {
			// Reset cursor for else
			this.state.cursor = forkNodeId

			// Push scope for else block
			this.state.scopes.push({ variables: new Map() })

			// Traverse else block and capture first node
			firstInElse = this.findFirstAwait(node.elseStatement)
			lastInElse = this.traverse(node.elseStatement)

			// Pop scope
			this.state.scopes.pop()

			// Add conditional edge from fork to first in else
			if (firstInElse && forkNodeId) {
				this.state.edges.push({ source: forkNodeId, target: firstInElse, condition: `!(${condition})` })
			}

			// Wire else branch to merge
			if (lastInElse) {
				this.state.edges.push({ source: lastInElse, target: mergeId })
			} else if (firstInElse) {
				this.state.edges.push({ source: firstInElse, target: mergeId })
			}
		}

		// Set cursor to merge
		this.state.cursor = mergeId
		return this.state.cursor
	}

	private visitTryStatement(node: ts.TryStatement): string | null {
		// Check for finally block
		if (node.finallyBlock) {
			this.addDiagnostic(node.finallyBlock, 'error', `Finally blocks are not supported in flow functions.`)
		}

		// Pre-scan catch block to find fallback node
		let fallbackNodeId: string | null = null
		if (node.catchClause) {
			const firstInCatch = this.findFirstAwait(node.catchClause.block)
			if (firstInCatch) {
				fallbackNodeId = firstInCatch
			}
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

		// Create merge node
		const mergeExportName = 'merge'
		const mergeCount = (this.state.usageCounts.get(mergeExportName) || 0) + 1
		this.state.usageCounts.set(mergeExportName, mergeCount)
		const mergeId = `${mergeExportName}_${mergeCount}`
		const mergeNode: NodeDefinition = {
			id: mergeId,
			uses: 'merge',
			config: { joinStrategy: 'any' },
		}
		this.state.nodes.push(mergeNode)

		// Wire try branch to merge
		if (lastInTry) {
			this.state.edges.push({ source: lastInTry, target: mergeId })
		}

		// Wire catch branch to merge
		if (lastInCatch) {
			this.state.edges.push({ source: lastInCatch, target: mergeId })
		}

		// Set cursor to merge
		this.state.cursor = mergeId
		return this.state.cursor
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

	private visitPromiseAll(node: ts.CallExpression, awaitNode: ts.AwaitExpression): string | null {
		// Get the array argument
		const arrayArg = node.arguments[0]
		if (!arrayArg || !ts.isArrayLiteralExpression(arrayArg)) {
			this.addDiagnostic(node, 'error', 'Promise.all requires an array literal argument')
			return this.state.cursor
		}

		// Find the gather node (the node that uses the Promise.all results)
		const gatherNodeId = this.findGatherNode(awaitNode)
		if (!gatherNodeId) {
			this.addDiagnostic(awaitNode, 'warning', 'Could not find gather node for Promise.all results')
			return this.state.cursor
		}

		// Process each parallel call
		const parallelNodeIds: string[] = []
		for (const element of arrayArg.elements) {
			if (ts.isCallExpression(element) && ts.isAwaitExpression(element.parent)) {
				// This is an await call expression in the array
				const nodeId = this.processParallelCall(element)
				if (nodeId) {
					parallelNodeIds.push(nodeId)
					// Create edge from current cursor to parallel node
					if (this.state.cursor) {
						this.state.edges.push({ source: this.state.cursor, target: nodeId })
					}
				}
			}
		}

		// Wire all parallel nodes to the gather node
		for (const parallelNodeId of parallelNodeIds) {
			this.state.edges.push({ source: parallelNodeId, target: gatherNodeId })
		}

		// Configure gather node to wait for all inputs
		const gatherNode = this.state.nodes.find((n) => n.id === gatherNodeId)
		if (gatherNode) {
			gatherNode.config = { ...gatherNode.config, joinStrategy: 'all' }
		}

		// Update cursor to gather node
		this.state.cursor = gatherNodeId
		return gatherNodeId
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
						const count = (this.state.usageCounts.get(exportName) || 0) + 1
						this.state.usageCounts.set(exportName, count)

						let nodeDef: NodeDefinition
						if (exportInfo.type === 'step') {
							nodeDef = {
								id: `${exportName}_parallel_${count}`,
								uses: exportName,
							}
							this.registry[exportName] = { importPath: filePath, exportName }
						} else if (exportInfo.type === 'flow') {
							nodeDef = {
								id: `${exportName}_parallel_${count}`,
								uses: 'subflow',
								params: { blueprintId: exportName },
							}
						} else {
							return null
						}

						this.state.nodes.push(nodeDef)
						return nodeDef.id
					}
				}
			}
		}
		return null
	}

	private findGatherNode(awaitNode: ts.AwaitExpression): string | null {
		// Find the node that uses the Promise.all results
		// This is typically the next await call that uses the destructured results
		const parent = awaitNode.parent
		if (ts.isVariableDeclaration(parent) && parent.name) {
			// Check if it's a destructuring pattern
			if (ts.isArrayBindingPattern(parent.name)) {
				// Look for the next statement that uses any of these variables
				const scope = this.findContainingScope(awaitNode)
				if (scope) {
					const nextStatement = this.findNextStatement(awaitNode, scope)
					if (nextStatement && ts.isExpressionStatement(nextStatement)) {
						const callExpr = this.findAwaitCallInStatement(nextStatement)
						if (callExpr) {
							// Process this as the gather node
							return this.processParallelCall(callExpr)
						}
					}
				}
			}
		}

		// Fallback: if we can't find a specific gather node, create a synthetic one
		const gatherCount = (this.state.usageCounts.get('gather') || 0) + 1
		this.state.usageCounts.set('gather', gatherCount)
		const gatherId = `gather_${gatherCount}`
		const gatherNode: NodeDefinition = {
			id: gatherId,
			uses: 'gather',
		}
		this.state.nodes.push(gatherNode)
		return gatherId
	}

	private findContainingScope(node: ts.Node): ts.Block | undefined {
		let current = node.parent
		while (current) {
			if (ts.isBlock(current)) {
				return current
			}
			current = current.parent
		}
		return undefined
	}

	private findNextStatement(node: ts.Node, scope: ts.Block): ts.Statement | undefined {
		const statements = scope.statements
		for (let i = 0; i < statements.length - 1; i++) {
			if (statements[i].getStart() <= node.getStart() && node.getEnd() <= statements[i].getEnd()) {
				return statements[i + 1]
			}
		}
		return undefined
	}

	private findAwaitCallInStatement(statement: ts.Statement): ts.CallExpression | null {
		if (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)) {
			const awaitExpr = statement.expression
			if (ts.isCallExpression(awaitExpr.expression)) {
				return awaitExpr.expression
			}
		}
		return null
	}
}
