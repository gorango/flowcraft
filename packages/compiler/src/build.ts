import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from './config-loader'
import { compileProject } from './index'
import type { FlowcraftConfig } from './types'

export interface CompileFlowsOptions extends FlowcraftConfig {}

// This is the generic, reusable function
export async function buildFlows(pluginOptions: CompileFlowsOptions = {}) {
	const projectRoot = process.cwd()

	// 1. Load config from flowcraft.config.js/ts
	const loadedConfig = await loadConfig(projectRoot)

	// 2. Define defaults
	const defaults: FlowcraftConfig = {
		entryPoints: [path.resolve(projectRoot, 'src/index.ts')],
		tsConfigPath: path.resolve(projectRoot, 'tsconfig.json'),
		manifestPath: path.resolve(projectRoot, 'dist/flowcraft.manifest.js'),
	}

	// 3. Merge configurations with the correct priority:
	//    Defaults < Config File < Plugin Options
	const finalConfig = {
		...defaults,
		...loadedConfig,
		...pluginOptions,
	} as Required<FlowcraftConfig>

	const { entryPoints, tsConfigPath, manifestPath } = finalConfig

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
