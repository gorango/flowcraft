import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { Compiler } from './compiler'
import type { CompilationDiagnostic, CompilationOutput } from './types'

export function compileProject(entryFilePaths: string[], tsConfigPath: string): CompilationOutput {
	const compiler = new Compiler(tsConfigPath)
	return compiler.compileProject(entryFilePaths)
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

function extractStepMetas(code: string): Map<string, Record<string, unknown>> {
	const metas = new Map<string, Record<string, unknown>>()
	const regex = /@step[ \t]*\(\s*({[^}]*})\s*\)[ \t]*\n(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
	let m: RegExpExecArray | null
	m = regex.exec(code)
	while (m) {
		try {
			const params = JSON.parse(m[1].replace(/(\w+):/g, '"$1":'))
			metas.set(m[2], params)
		} catch {
			// ignore malformed JSON in step decorator
		}
		m = regex.exec(code)
	}
	return metas
}

function preprocessCode(code: string): string {
	return (
		code
			// Normalize decorator-style to JSDoc-style
			// Use [ \t]* instead of \s* so we don't consume the trailing newline
			.replace(/^@flow[ \t]*$/gm, '/** @flow */')
			.replace(/^@step(\s*\([^)]*\))?[ \t]*$/gm, '/** @step */')
			// Add export keyword to non-exported functions with annotations
			.replace(/(\/\*\* @(?:flow|step) \*\/)\s*\n(?!export\s)/g, '$1\nexport ')
	)
}

function remapNode(
	node: NodeDefinition,
	stepMetas: Map<string, Record<string, unknown>>,
): NodeDefinition {
	if (node.uses === 'loop-controller') {
		return { ...node, uses: 'loop' }
	}

	const knownTypes = new Set(['sleep', 'wait', 'webhook', 'subflow', 'loop'])
	if (knownTypes.has(node.uses)) {
		return node
	}

	const stepMeta = stepMetas.get(node.uses)
	return {
		...node,
		uses: 'process',
		params: {
			uses: node.uses,
			label: (stepMeta?.label as string) ?? node.uses,
			...(stepMeta?.description ? { description: stepMeta.description as string } : {}),
			...node.params,
		},
	}
}

export * from './build'
