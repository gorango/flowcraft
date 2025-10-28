import type { EdgeDefinition, NodeDefinition } from 'flowcraft'
import * as ts from 'typescript'
import type { Scope } from './types'

export class CompilerState {
	private cursor: string | null = null
	private nodes: NodeDefinition[] = []
	private edges: EdgeDefinition[] = []
	private scopes: Scope[] = []
	private fallbackScope: string | null = null
	private usageCounts: Map<string, number> = new Map()
	private pendingBranches: { ends: string[]; joinStrategy: 'any' | 'all' } | null = null
	private pendingForkEdges: { source: string; condition: string }[] = []
	private loopScopeStack: { controllerId: string; breakTargetId: string }[] = []

	constructor() {
		// Push initial scope
		this.scopes.push({ variables: new Map() })
	}

	getCursor(): string | null {
		return this.cursor
	}

	setCursor(nodeId: string | null): void {
		this.cursor = nodeId
	}

	getNodes(): NodeDefinition[] {
		return this.nodes
	}

	getEdges(): EdgeDefinition[] {
		return this.edges
	}

	getScopes(): Scope[] {
		return this.scopes
	}

	getFallbackScope(): string | null {
		return this.fallbackScope
	}

	setFallbackScope(scope: string | null): void {
		this.fallbackScope = scope
	}

	getUsageCounts(): Map<string, number> {
		return this.usageCounts
	}

	getPendingBranches(): { ends: string[]; joinStrategy: 'any' | 'all' } | null {
		return this.pendingBranches
	}

	setPendingBranches(branches: { ends: string[]; joinStrategy: 'any' | 'all' } | null): void {
		this.pendingBranches = branches
	}

	getPendingForkEdges(): { source: string; condition: string }[] {
		return this.pendingForkEdges
	}

	pushScope(scope: Scope): void {
		this.scopes.push(scope)
	}

	popScope(): Scope | undefined {
		return this.scopes.pop()
	}

	addNodeAndWire(nodeDef: NodeDefinition, node: ts.Node, sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): void {
		this.nodes.push(nodeDef)
		if (this.pendingBranches) {
			for (const end of this.pendingBranches.ends) {
				this.edges.push({
					source: end,
					target: nodeDef.id,
					_sourceLocation: this.getSourceLocation(node, sourceFile),
				})
			}
			nodeDef.config = {
				...nodeDef.config,
				joinStrategy: this.pendingBranches.joinStrategy as 'all' | 'any',
			}
			this.pendingBranches = null
		}
		if (this.pendingForkEdges.length > 0) {
			for (const forkEdge of this.pendingForkEdges) {
				this.edges.push({
					source: forkEdge.source,
					target: nodeDef.id,
					condition: forkEdge.condition,
					_sourceLocation: this.getSourceLocation(node, sourceFile),
				})
			}
			this.pendingForkEdges = []
		}
		if (this.cursor) {
			const edge: any = {
				source: this.cursor,
				target: nodeDef.id,
				_sourceLocation: this.getSourceLocation(node, sourceFile),
			}
			// If source is a loop-controller, add break action
			const sourceNode = this.nodes.find((n) => n.id === this.cursor)
			if (sourceNode && sourceNode.uses === 'loop-controller') {
				edge.action = 'break'
			}
			this.edges.push(edge)
		}
		this.cursor = nodeDef.id

		// Map variable to node output if it's a VariableDeclaration
		const parent = node.parent
		if (ts.isVariableDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
			const varName = parent.name.text
			const returnType = typeChecker.getTypeAtLocation(node)
			this.scopes[this.scopes.length - 1].variables.set(varName, {
				nodeId: nodeDef.id,
				type: returnType,
			})
		}
	}

	addNode(nodeDef: NodeDefinition): void {
		this.nodes.push(nodeDef)
	}

	addEdge(edge: EdgeDefinition): void {
		this.edges.push(edge)
	}

	addPendingForkEdge(source: string, condition: string): void {
		this.pendingForkEdges.push({ source, condition })
	}

	pushLoopScope(scope: { controllerId: string; breakTargetId: string }): void {
		this.loopScopeStack.push(scope)
	}

	popLoopScope(): void {
		this.loopScopeStack.pop()
	}

	getCurrentLoopScope(): { controllerId: string; breakTargetId: string } | undefined {
		return this.loopScopeStack[this.loopScopeStack.length - 1]
	}

	incrementUsageCount(name: string): number {
		const count = (this.usageCounts.get(name) || 0) + 1
		this.usageCounts.set(name, count)
		return count
	}

	setUsageCounts(counts: Map<string, number>): void {
		this.usageCounts = new Map(counts)
	}

	private getSourceLocation(node: ts.Node, sourceFile: ts.SourceFile): import('flowcraft').SourceLocation {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
		return {
			file: sourceFile.fileName,
			line: line + 1,
			column: character + 1,
		}
	}
}
