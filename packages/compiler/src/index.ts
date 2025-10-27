import { Compiler } from './compiler'
import type { CompilationOutput } from './types'

export function compileProject(entryFilePaths: string[], tsConfigPath: string): CompilationOutput {
	const compiler = new Compiler(tsConfigPath)
	return compiler.compileProject(entryFilePaths)
}
