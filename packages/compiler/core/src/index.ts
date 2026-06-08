import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { WorkflowBlueprint } from 'flowcraft'
import { Compiler } from './compiler'
import type { CompilationDiagnostic, CompilationOutput } from './types'
import { extractStepMetas, preprocessCode, remapNode } from './shared'

export function compileProject(
	entryFilePaths: string[],
	tsConfigPath: string,
	manifestPath?: string,
): CompilationOutput {
	const compiler = new Compiler(tsConfigPath, manifestPath)
	return compiler.compileProject(entryFilePaths, manifestPath)
}

interface CompileCodeResult {
	blueprint: WorkflowBlueprint | null
	diagnostics: CompilationDiagnostic[]
}

/**
 * Compile a raw TypeScript code string (using @flow / @step decorator-style annotations)
 * into a WorkflowBlueprint. Writes the code to a temp file and uses the full
 * @flowcraft/compiler pipeline (TypeScript AST, FlowAnalyzer, visitors).
 *
 * Supports both formats:
 *   @flow / @step (decorator-style, may include export)
 *   /** @flow *&#47; / @** @step *&#47; (JSDoc-style)
 *
 * Step metadata from {@code @step({ label: '...', description: '...' })} is
 * preserved and applied to the resulting blueprint nodes.
 */
export function compileCode(code: string, options?: { id?: string }): CompileCodeResult {
	const stepMetas = extractStepMetas(code)

	const processed = preprocessCode(code)

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-'))
	const tmpFile = path.join(tmpDir, 'input.ts')
	const tmpConfig = path.join(tmpDir, 'tsconfig.json')

	fs.writeFileSync(tmpFile, processed)
	fs.writeFileSync(
		tmpConfig,
		JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'bundler',
				strict: true,
				lib: ['ESNext'],
			},
			include: [tmpFile],
		}),
	)

	try {
		const compiler = new Compiler(tmpConfig)
		const result = compiler.compileProject([tmpFile])

		const blueprints = Object.values(result.blueprints)
		const bp = blueprints[0] ?? null

		if (bp) {
			if (options?.id) bp.id = options.id
			bp.nodes = bp.nodes.map((node) => remapNode(node, stepMetas))
		}

		return { blueprint: bp, diagnostics: result.diagnostics }
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
}

export * from './build'
