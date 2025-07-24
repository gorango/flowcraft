import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true, // might need to change depending on deployment
	title: 'Cascade',
	description: 'A Workflow Framework',
	vite: {
		optimizeDeps: {
			include: [
				'mermaid',
			],
		},
		plugins: [
			MermaidPlugin(),
		],
	},
	markdown: {
		config: (md) => {
			MermaidMarkdown(md, {})
		},
	},
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide', activeMatch: '/guide' },
			{ text: 'API', link: '/api-reference', activeMatch: '/api-reference' },
		],
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2025-present Goran Spasojevic',
		},
		sidebar: {
			'/guide/': [
				{
					text: 'Guide',
					collapsed: true,
					items: [
						{ text: 'Introduction', link: '/guide/' },
						{ text: 'Builders', link: '/guide/builders' },
						{ text: 'Functional API', link: '/guide/functional-api' },
					],
				},
				{
					text: 'Recipes',
					collapsed: true,
					items: [
						{ text: 'Overview', link: '/guide/recipes/' },
						{ text: 'Creating a Loop', link: '/guide/recipes/creating-a-loop' },
						{ text: 'Fan-out and Fan-in', link: '/guide/recipes/fan-out-fan-in' },
						{ text: 'Resilient API Call Node', link: '/guide/recipes/resilient-api-call' },
						{ text: 'Data Processing Pipeline', link: '/guide/recipes/data-processing-pipeline' },
					],
				},
				{
					text: 'Best Practices',
					collapsed: true,
					items: [
						{ text: 'State Management', link: '/guide/best-practices/state-management' },
						{ text: 'Data Flow in Sub-Workflows', link: '/guide/best-practices/sub-workflow-data' },
						{ text: 'Testing Workflows', link: '/guide/best-practices/testing' },
						{ text: 'Debugging Workflows', link: '/guide/best-practices/debugging' },
					],
				},
				{
					text: 'Advanced Concepts',
					collapsed: true,
					items: [
						{ text: 'Composition', link: '/guide/advanced-guides/composition' },
						{ text: 'Error Handling', link: '/guide/advanced-guides/error-handling' },
						{ text: 'Cancellation', link: '/guide/advanced-guides/cancellation' },
						{ text: 'Middleware', link: '/guide/advanced-guides/middleware' },
						{ text: 'Pluggable Logging', link: '/guide/advanced-guides/logging' },
						{ text: 'Observability', link: '/guide/advanced-guides/observability' },
						{ text: 'Custom Executor', link: '/guide/advanced-guides/custom-executor' },
					],
				},
				{
					text: 'Tooling',
					collapsed: true,
					items: [
						{ text: 'Visualizing Workflows', link: '/guide/tooling/mermaid' },
					],
				},
				{
					text: 'API Reference',
					link: '/api-reference/',
				},
			],
			'/api-reference/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'Introduction', link: '/api-reference/' },
						{ text: 'Workflow', link: '/api-reference/workflow' },
						{ text: 'Builders', link: '/api-reference/builder' },
						{ text: 'Functional Helpers', link: '/api-reference/fn' },
					],
				},
			],
		},
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/gorango/cascade' },
		],
	},
})
