import { buildFlows, type CompileFlowsOptions } from '@flowcraft/compiler'

export interface FlowcraftNextPluginOptions extends CompileFlowsOptions {}

export function withFlowcraft(nextConfig: any = {}, flowcraftOptions?: FlowcraftNextPluginOptions) {
	return {
		...nextConfig,
		webpack(config: any, webpackOptions: { dev: boolean; isServer: boolean }) {
			// Only run the compiler for production builds on the client side
			if (!webpackOptions.dev && !webpackOptions.isServer) {
				buildFlows(flowcraftOptions).catch((error: unknown) => {
					console.error('Flowcraft compilation failed:', error)
					throw error
				})
			}

			// For dev mode, we could implement file watching here, but it's complex
			// with Next.js Fast Refresh. For now, users can run the compiler separately
			// or set up a file watcher in their project root.

			if (typeof nextConfig.webpack === 'function') {
				return nextConfig.webpack(config, webpackOptions)
			}
			return config
		},
	}
}
