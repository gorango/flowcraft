import { buildFlows, type CompileFlowsOptions } from '@flowcraft/compiler'
import type { AstroIntegration } from 'astro'

export interface FlowcraftAstroIntegrationOptions extends CompileFlowsOptions {}

export default function flowcraftIntegration(options?: FlowcraftAstroIntegrationOptions): AstroIntegration {
	return {
		name: '@flowcraft/astro-integration',
		hooks: {
			'astro:config:setup': async ({ command }) => {
				// Only run the compiler for production builds
				if (command === 'build') {
					await buildFlows(options)
				}
			},
		},
	}
}
