import { buildFlows, type CompileFlowsOptions } from '@flowcraft/compiler'
import type { Plugin } from 'esbuild'

export interface FlowcraftEsbuildPluginOptions extends CompileFlowsOptions {}

export default function flowcraftPlugin(options?: FlowcraftEsbuildPluginOptions): Plugin {
	return {
		name: 'flowcraft-compiler',
		setup(build) {
			// Run the compiler once at the start of the build
			build.onStart(async () => {
				await buildFlows(options)
			})
		},
	}
}
