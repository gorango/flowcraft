import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from 'flowcraft'

export interface FileAnalysis {
	filePath: string
	sourceFile: import('typescript').SourceFile
	exports: Map<string, { type: 'flow' | 'step'; node: import('typescript').FunctionDeclaration }>
}

export interface CompilationOutput {
	blueprints: Record<string, WorkflowBlueprint>
	registry: Record<string, { importPath: string; exportName: string }>
	diagnostics: CompilationDiagnostic[]
	manifestSource: string
}

export interface CompilationDiagnostic {
	file: string
	line: number
	column: number
	message: string
	severity: 'error' | 'warning' | 'info'
}

// Keep interface for backward compatibility if needed
export interface CompilerStateInterface {
	cursor: string | null
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	scopes: Scope[]
	pendingEdges: PendingEdge[]
	fallbackScope: string | null
	usageCounts: Map<string, number>
	pendingBranches: { ends: string[]; joinStrategy: string } | null
	pendingForkEdges: { source: string; condition: string }[]
}

export interface Scope {
	variables: Map<string, { nodeId: string; type: import('typescript').Type }>
}

export interface PendingEdge {
	sourceId: string
	condition?: string
	action?: string
}
