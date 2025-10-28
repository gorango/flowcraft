import fs from 'node:fs'
import path from 'node:path'
import { transformSync } from 'esbuild'
import type { FlowcraftConfig } from './types'

/**
 * Finds and loads the Flowcraft configuration file from the project root.
 * Supports flowcraft.config.ts and flowcraft.config.js.
 */
export async function loadConfig(root: string = process.cwd()): Promise<FlowcraftConfig> {
	const tsConfigPath = path.resolve(root, 'flowcraft.config.ts')
	const jsConfigPath = path.resolve(root, 'flowcraft.config.js')

	let configPath: string | undefined
	let isTs = false

	if (fs.existsSync(tsConfigPath)) {
		configPath = tsConfigPath
		isTs = true
	} else if (fs.existsSync(jsConfigPath)) {
		configPath = jsConfigPath
	}

	if (!configPath) {
		return {}
	}

	try {
		if (isTs) {
			const tsContent = fs.readFileSync(configPath, 'utf-8')
			const { code } = transformSync(tsContent, {
				loader: 'ts',
				format: 'esm',
			})

			const dataUri = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
			const module = await import(dataUri)
			return module.default || {}
		} else {
			const module = await import(configPath)
			return module.default || {}
		}
	} catch (e) {
		console.error(`Error loading Flowcraft config file: ${configPath}`)
		throw e
	}
}
