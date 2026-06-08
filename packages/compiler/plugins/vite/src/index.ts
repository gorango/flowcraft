import { buildFlows, type CompileFlowsOptions } from '@flowcraft/compiler'
import type { Plugin } from 'vite'

export default function flowcraftCompiler(options?: CompileFlowsOptions): Plugin {
	return {
		name: 'flowcraft-compiler',

		async buildStart() {
			// For `vite build`, this runs once at the beginning
			if (process.env.NODE_ENV === 'production') {
				await buildFlows(options)
			}
		},

		async configureServer(server) {
			// For `vite dev`, this runs on startup and watches for changes
			await buildFlows(options)

			server.watcher.on('all', async (eventName, filePath) => {
				if (filePath.endsWith('.ts') && !filePath.includes('flowcraft.manifest')) {
					console.log(`[flowcraft] File ${eventName}: ${filePath}. Recompiling...`)
					await buildFlows(options)
				}
			})
		},
	}
}
