import type ts from 'typescript'
import type { WorkflowBlueprint } from 'flowcraft'

export interface FileAnalysis {
	filePath: string
	sourceFile: ts.SourceFile
	exports: Map<
		string,
		{
			type: 'flow' | 'step'
			node: ts.FunctionDeclaration | ts.ArrowFunction
		}
	>
}

export interface CompilationOutput {
	blueprints: Record<string, WorkflowBlueprint>
	registry: Record<string, { importPath: string; exportName: string }>
	diagnostics: CompilationDiagnostic[]
	manifestSource: string
	/**
	 * The resolved path to the manifest file that was used for import path computation.
	 * Empty string if no manifest path was configured (default: './dist/flowcraft.manifest.ts').
	 */
	manifestPath?: string
}

export interface CompilationDiagnostic {
	file: string
	line: number
	column: number
	message: string
	severity: 'error' | 'warning' | 'info'
}

export interface VariableInfo {
	nodeId: string
	type: ts.Type
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
