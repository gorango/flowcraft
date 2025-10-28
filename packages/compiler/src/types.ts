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

export interface VariableInfo {
	nodeId: string
	type: import('typescript').Type
	variableType?: 'webhook' | 'normal'
}

export interface Scope {
	variables: Map<string, VariableInfo>
}

export interface PendingEdge {
	sourceId: string
	condition?: string
	action?: string
}

export interface FlowcraftConfig {
	/**
	 * An array of entry point files for the compiler.
	 * @default ['src/index.ts']
	 */
	entryPoints?: string[]
	/**
	 * Path to the tsconfig.json file.
	 * @default './tsconfig.json'
	 */
	tsConfigPath?: string
	/**
	 * The output path for the generated manifest file.
	 * @default 'dist/flowcraft.manifest.js'
	 */
	manifestPath?: string
}
