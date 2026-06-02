import ts from 'typescript'

export function createVirtualProgram(
	files: Record<string, string>,
	compilerOptions: ts.CompilerOptions = {},
): { program: ts.Program; typeChecker: ts.TypeChecker } {
	const fileMap = new Map(Object.entries(files))

	const host: ts.CompilerHost = {
		getSourceFile(fileName, languageVersion) {
			const content = fileMap.get(fileName)
			if (content !== undefined) {
				return ts.createSourceFile(fileName, content, languageVersion)
			}
			return undefined
		},
		getDefaultLibFileName: () => '/lib.esnext.d.ts',
		writeFile: () => {},
		getCurrentDirectory: () => '/',
		getCanonicalFileName: (f) => f,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n',
		fileExists(fileName) {
			return fileMap.has(fileName)
		},
		readFile(fileName) {
			return fileMap.get(fileName)
		},
	}

	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noLib: true,
		...compilerOptions,
	}

	const program = ts.createProgram([...fileMap.keys()], options, host)
	const typeChecker = program.getTypeChecker()
	return { program, typeChecker }
}
