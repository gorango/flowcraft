import fs from 'node:fs/promises'
import path from 'node:path'
import { compileProject } from './index'

export interface CompileFlowsOptions {
	entryPoints?: string[]
	tsConfigPath?: string
	manifestPath?: string
}

// This is the generic, reusable function
export async function buildFlows(options: CompileFlowsOptions = {}) {
	const projectRoot = process.cwd()
	const entryPoints = options.entryPoints ?? [path.resolve(projectRoot, 'src/index.ts')]
	const tsConfigPath = options.tsConfigPath ?? path.resolve(projectRoot, 'tsconfig.json')
	const manifestPath = options.manifestPath ?? path.resolve(projectRoot, 'dist/flowcraft.manifest.js')

	console.log('Compiling Flowcraft workflows...')

	try {
		const { diagnostics, manifestSource } = compileProject(entryPoints, tsConfigPath)

		if (diagnostics.some((d) => d.severity === 'error')) {
			console.error('❌ Flowcraft compilation failed:')
			diagnostics
				.filter((d) => d.severity === 'error')
				.forEach((d) => {
					console.error(`  - ${path.relative(projectRoot, d.file)}:${d.line}:${d.column} - ${d.message}`)
				})
			throw new Error('Flowcraft compilation failed.')
		}

		await fs.mkdir(path.dirname(manifestPath), { recursive: true })
		await fs.writeFile(manifestPath, manifestSource)
		console.log(`✅ Flowcraft compilation successful! Manifest: ${path.relative(projectRoot, manifestPath)}`)
	} catch (error) {
		console.error('❌ An unexpected error occurred during Flowcraft compilation:')
		// Don't log the whole error object unless verbose logging is on
		console.error(error instanceof Error ? error.message : String(error))
		// Re-throw to fail the build process
		throw error
	}
}
