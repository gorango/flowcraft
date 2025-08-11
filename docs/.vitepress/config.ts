import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true,
	base: '/flowcraft/',
	title: 'Flowcraft',
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
			{ text: 'Guide', link: '/guide/', activeMatch: '/guide' },
			{ text: 'API', link: '/api-reference/', activeMatch: '/api-reference' },
		],
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2025-present Goran Spasojevic',
		},
		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					items: [
						{ text: 'What is Flowcraft?', link: '/guide/' },
						{ text: 'Core Concepts', link: '/guide/core-concepts' },
						{ text: 'When to Use Flowcraft', link: '/guide/when-to-use' },
						{ text: 'Your First Workflow', link: '/guide/getting-started' },
					],
				},
				{
					text: 'Programmatic Flows',
					collapsed: false,
					items: [
						{ text: 'The Basics', link: '/guide/programmatic/basics' },
						{ text: 'Functional API', link: '/guide/programmatic/functional-api' },
						{ text: 'Data Processing Pipelines', link: '/guide/programmatic/data-pipelines' },
						{
							text: 'Common Patterns (Recipes)',
							collapsed: true,
							items: [
								{ text: 'Creating Loops', link: '/guide/programmatic/patterns-loops' },
								{ text: 'Parallel API Calls (Fan-Out)', link: '/guide/programmatic/patterns-parallel-flow' },
								{ text: 'Batch Processing', link: '/guide/programmatic/patterns-batch-flow' },
							],
						},
					],
				},
				{
					text: 'Declarative Flows',
					collapsed: false,
					items: [
						{ text: 'The Basics', link: '/guide/declarative/basics' },
						{ text: 'Composition & Data Flow', link: '/guide/declarative/composition-data-flow' },
						{ text: 'Dependency Injection', link: '/guide/declarative/dependency-injection' },
						{ text: 'Tooling & Validation', link: '/guide/declarative/tooling-validation' },
					],
				},
				{
					text: 'Advanced Topics',
					collapsed: false,
					items: [
						{ text: 'Resilience & Error Handling', link: '/guide/advanced/error-handling' },
						{ text: 'Execution Control', link: '/guide/advanced/execution-control' },
						{ text: 'Extending Flowcraft', link: '/guide/advanced/extending' },
						{ text: 'Best Practices', link: '/guide/advanced/best-practices' },
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
						{ text: 'Core API', link: '/api-reference/core' },
						{ text: 'Builders API', link: '/api-reference/builders' },
						{ text: 'Functional API', link: '/api-reference/functional' },
						{ text: 'Utilities API', link: '/api-reference/utils' },
					],
				},
			],
		},
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/gorango/flowcraft' },
		],
	},
})
