import { defineConfig } from 'vitepress'

export default defineConfig({
	cleanUrls: true, // might need to change depending on deployment
	title: 'Cascade',
	description: 'A Workflow Framework',
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide', activeMatch: '/guide' },
			{ text: 'API', link: '/api-reference', activeMatch: '/api-reference' },
		],
		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					items: [
						{ text: 'What is Cascade?', link: '/guide' },
						{ text: 'Getting Started', link: '/guide/getting-started' },
						{ text: 'Philosophy & Comparison', link: '/guide/philosophy-and-comparison' },
						{ text: 'Core Concepts', link: '/guide/core-concepts' },
						{ text: 'Builders', link: '/guide/builders' },
						{ text: 'Functional API', link: '/guide/functional-api' },
					],
				},
				{
					text: 'Advanced',
					items: [
						{ text: 'Composition', link: '/guide/advanced-guides/composition' },
						{ text: 'Cancellation', link: '/guide/advanced-guides/cancellation' },
						{ text: 'Error Handling', link: '/guide/advanced-guides/error-handling' },
						{ text: 'Middleware', link: '/guide/advanced-guides/middleware' },
						{ text: 'Custom Executor', link: '/guide/advanced-guides/custom-executor' },
					],
				},
				{
					text: 'Recipes',
					items: [
						{ text: 'Creating a Loop', link: '/guide/recipes/creating-a-loop' },
						{ text: 'Fan-out and Fan-in', link: '/guide/recipes/fan-out-fan-in' },
					],
				},
				{
					text: 'Best Practices',
					items: [
						{ text: 'State Management', link: '/guide/best-practices/state-management' },
						{ text: 'Testing Workflows', link: '/guide/best-practices/testing' },
						{ text: 'Debugging Workflows', link: '/guide/best-practices/debugging' },
					],
				},
				{
					text: 'Tooling',
					items: [
						{ text: 'Visualizing Workflows', link: '/guide/tooling/mermaid' },
					],
				},
			],
			'/api-reference/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'Introduction', link: '/api-reference' },
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
