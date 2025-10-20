import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import './custom.css'
// import { Background } from '@vue-flow/background'
// import { VueFlow } from '@vue-flow/core'
// import VueFlowDiagram from '../../../components/Flow.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
// import CopyOrDownloadAsMarkdownButtons from 'vitepress-plugin-llms/vitepress-components/CopyOrDownloadAsMarkdownButtons.vue'

export default {
	...DefaultTheme,
	enhanceApp({ app }) {
		// app.component('CopyOrDownloadAsMarkdownButtons', CopyOrDownloadAsMarkdownButtons)
		// 	app.component('VueFlowDiagram', VueFlowDiagram)
		// 	app.component('VueFlow', VueFlow)
		// 	app.component('Background', Background)
	},
} satisfies Theme
