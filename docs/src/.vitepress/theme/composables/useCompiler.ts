import type { WorkflowBlueprint } from 'flowcraft'

interface CompilationDiagnostic {
	file: string
	line: number
	column: number
	message: string
	severity: 'error' | 'warning' | 'info'
}

export interface UseCompilerReturn {
	blueprint: typeof blueprint
	diagnostics: typeof diagnostics
	registry: typeof registry
	compiling: typeof compiling
	error: typeof error
	compile: (source: string) => Promise<void>
}

const blueprint = ref<WorkflowBlueprint | null>(null)
const diagnostics = ref<CompilationDiagnostic[]>([])
const registry = ref<Record<string, Function>>({})
const compiling = ref(false)
const error = ref<string | null>(null)

let compileModule: any = null

export function useCompiler(): UseCompilerReturn {
	async function compile(source: string) {
		compiling.value = true
		error.value = null
		blueprint.value = null
		diagnostics.value = []
		try {
			if (!compileModule) {
				compileModule = await import('@flowcraft/compiler/browser')
			}
			const result = compileModule.compileCodeBrowser(source)
			blueprint.value = result.blueprint
			diagnostics.value = result.diagnostics
			registry.value = result.registry || {}
		} catch (e) {
			error.value = e instanceof Error ? e.message : String(e)
		} finally {
			compiling.value = false
		}
	}

	return { blueprint, diagnostics, registry, compiling, error, compile }
}
