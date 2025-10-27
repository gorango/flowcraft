import * as ts from 'typescript'
import type { Compiler } from './compiler'
import type { CompilerState } from './types'
import type { WorkflowBlueprint, NodeDefinition } from 'flowcraft'

export class FlowAnalyzer {
	private nodeCounter = 0
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
			id: this.functionNode.name!.text,
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
			// Check if it's context.get or context.set, ignore
			if (ts.isPropertyAccessExpression(callee.expression)) {
				const propAccess = callee.expression
				if (propAccess.expression.getText() === 'context') {
					return this.state.cursor
				}
			}

			const symbol = this.typeChecker.getSymbolAtLocation(callee.expression)
			if (symbol) {
				const declarations = symbol.getDeclarations()
				if (declarations && declarations.length > 0) {
					const decl = declarations[0]
					const filePath = decl.getSourceFile().fileName
					const fileAnalysis = this.compiler.fileCache.get(filePath)
					if (fileAnalysis) {
						const exportName = symbol.name
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
								this.registry[exportName] = { importPath: filePath, exportName }
							} else if (exportInfo.type === 'flow') {
								nodeDef = {
									id: `${exportName}_${count}`,
									uses: 'subflow',
									params: { blueprintId: exportName },
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

		const exportName = 'loop-controller'
		const count = (this.state.usageCounts.get(exportName) || 0) + 1
		this.state.usageCounts.set(exportName, count)
		const controllerId = `${exportName}_${count}`
		const controllerNode: NodeDefinition = {
			id: controllerId,
			uses: 'loop-controller',
			params: { condition: (node as any).condition?.getText() || 'true' },
			config: { joinStrategy: 'any' },
		}
		this.state.nodes.push(controllerNode)
		if (this.state.cursor) {
			this.state.edges.push({ source: this.state.cursor, target: controllerId })
		}
		const prevCursor = this.state.cursor
		this.state.cursor = controllerId

		// Traverse the body and capture the first node
		let firstInBody: string | null = null
		const originalVisit = this.visit.bind(this)
		this.visit = (node: ts.Node) => {
			if (!firstInBody && ts.isAwaitExpression(node)) {
				originalVisit(node)
				firstInBody = this.state.cursor
			} else {
				originalVisit(node)
			}
			return this.state.cursor
		}
		const lastInBody = this.traverse(node.statement)
		this.visit = originalVisit

		// Add continue edge from controller to first node in body
		if (firstInBody) {
			this.state.edges.push({ source: controllerId, target: firstInBody, action: 'continue' })
		}

		// Add loopback edge from last in body to controller
		if (lastInBody) {
			this.state.edges.push({ source: lastInBody, target: controllerId })
		}

		// The exit path is the current cursor (controller), next nodes will connect with break
		this.state.cursor = controllerId
		return this.state.cursor
	}

	private visitIfStatement(node: ts.IfStatement): string | null {
		const forkNodeId = this.state.cursor
		const condition = (node as any).condition.getText()

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
		let firstInIf: string | null = null
		const originalVisit = this.visit.bind(this)
		this.visit = (node: ts.Node) => {
			if (!firstInIf && ts.isAwaitExpression(node)) {
				originalVisit(node)
				firstInIf = this.state.cursor
			} else {
				originalVisit(node)
			}
			return this.state.cursor
		}
		const lastInIf = this.traverse(node.thenStatement)
		this.visit = originalVisit

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
			this.visit = (node: ts.Node) => {
				if (!firstInElse && ts.isAwaitExpression(node)) {
					originalVisit(node)
					firstInElse = this.state.cursor
				} else {
					originalVisit(node)
				}
				return this.state.cursor
			}
			lastInElse = this.traverse(node.elseStatement)
			this.visit = originalVisit

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

		// Placeholder for try handling
		this.traverse(node.tryBlock)
		if (node.catchClause) {
			this.traverse(node.catchClause.block)
		}
		return this.state.cursor
	}
}
