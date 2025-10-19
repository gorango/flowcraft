import process from 'node:process'

export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	devtools: { enabled: true },
	css: [
		'~/assets/css/tailwind.css',
		'~/assets/css/flow.css',
		'@vue-flow/core/dist/style.css',
	],

	modules: [
		'@nuxtjs/tailwindcss',
		'shadcn-nuxt',
		'@vueuse/nuxt',
		'@nuxtjs/color-mode',
		'@nuxt/fonts',
		'@nuxt/icon',
	],

	runtimeConfig: {
		openaiApiKey: process.env.NUXT_OPENAI_API_KEY,
		serpApiKey: process.env.NUXT_SERP_API_KEY,
	},

	colorMode: {
		preference: 'system',
		fallback: 'dark',
		hid: 'color-mode-script',
		globalName: '__COLOR_MODE__',
		classPrefix: '',
		classSuffix: '',
		storage: 'localStorage',
		storageKey: 'color-mode',
	},

	shadcn: {
		prefix: '',
		componentDir: './app/components/ui',
	},
})
