import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import '@vue-flow/core/dist/style.css'
import './custom.css'
import './flow.css'
// import CopyOrDownloadAsMarkdownButtons from 'vitepress-plugin-llms/vitepress-components/CopyOrDownloadAsMarkdownButtons.vue'

export default {
	...DefaultTheme,
	enhanceApp({ app }) {
		// app.component('CopyOrDownloadAsMarkdownButtons', CopyOrDownloadAsMarkdownButtons)
	},
} satisfies Theme
