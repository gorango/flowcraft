import type { CompileFlowsOptions } from '@flowcraft/compiler'
import flowcraftCompiler from '@flowcraft/vite-plugin'
import { addVitePlugin, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions extends Partial<CompileFlowsOptions> {}

export default defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@flowcraft/nuxt-module',
		configKey: 'flowcraft',
		compatibility: {
			nuxt: '^3.0.0',
		},
	},
	defaults: {},
	setup(options, _nuxt) {
		// Add the Vite plugin to the Nuxt build
		addVitePlugin(flowcraftCompiler(options) as any)
	},
})
