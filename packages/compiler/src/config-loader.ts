import fs from 'node:fs'
import path from 'node:path'
import * as esbuild from 'esbuild'
import type { FlowcraftConfig } from './types'

interface CacheEntry {
	mtimeMs: number
	config: FlowcraftConfig
}

const configCache = new Map<string, CacheEntry>()

/**
 * Finds and loads the Flowcraft configuration file from the project root.
 * Supports flowcraft.config.ts and flowcraft.config.js.
 * Uses esbuild.build with bundling to handle external imports, and caches
 * the result based on file modification time.
 */
export async function loadConfig(root: string = process.cwd()): Promise<FlowcraftConfig> {
	const tsConfigPath = path.resolve(root, 'flowcraft.config.ts')
	const jsConfigPath = path.resolve(root, 'flowcraft.config.js')

	let configPath: string | undefined

	if (fs.existsSync(tsConfigPath)) {
		configPath = tsConfigPath
	} else if (fs.existsSync(jsConfigPath)) {
		configPath = jsConfigPath
	}

	if (!configPath) {
		return {}
	}

	// mtime-based cache: skip transpilation if file hasn't changed
	const stat = fs.statSync(configPath)
	const mtimeMs = stat.mtimeMs
	const cached = configCache.get(configPath)
	if (cached && cached.mtimeMs === mtimeMs) {
		return cached.config
	}

	try {
		const isTs = configPath.endsWith('.ts')

		if (isTs) {
			const result = await esbuild.build({
				entryPoints: [configPath],
				bundle: true,
				write: false,
				format: 'esm',
				platform: 'node',
				external: ['@flowcraft/compiler', 'flowcraft'],
				loader: { '.ts': 'ts' },
			})
			const bundledCode = result.outputFiles[0].text

			const dataUri = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
			const module = await import(dataUri)
			const config: FlowcraftConfig = module.default || {}
			configCache.set(configPath, { mtimeMs, config })
			return config
		} else {
			const module = await import(configPath)
			const config: FlowcraftConfig = module.default || {}
			configCache.set(configPath, { mtimeMs, config })
			return config
		}
	} catch (e) {
		console.error(`Error loading Flowcraft config file: ${configPath}`)
		throw e
	}
}
