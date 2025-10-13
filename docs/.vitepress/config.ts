import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true,
	base: '/flowcraft/',
	title: 'Flowcraft',
	description: 'A lightweight, unopinionated workflow framework for executing declarative DAGs',
	vite: {
		optimizeDeps: {
			include: ['mermaid'],
		},
		plugins: [MermaidPlugin()],
	},
	markdown: {
		config: (md) => {
			MermaidMarkdown(md, {})
		},
	},
	themeConfig: {
		search: {
			provider: 'local',
		},
		nav: [
			{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
			{ text: 'Examples', link: '/examples/', activeMatch: '/examples/' },
			{ text: 'API', link: '/api-reference/', activeMatch: '/api-reference/' },
			{ text: 'GitHub', link: 'https://github.com/gorango/flowcraft' },
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
						{ text: 'Getting Started', link: '/guide/getting-started' },
						{ text: 'Core Concepts', link: '/guide/core-concepts' },
					],
				},
				{
					text: 'Building Workflows',
					collapsed: false,
					items: [
						{ text: 'Defining Workflows', link: '/guide/defining-workflows' },
						{ text: 'Nodes and Edges', link: '/guide/nodes-and-edges' },
						{ text: 'Context Management', link: '/guide/context-management' },
					],
				},
				{
					text: 'Advanced Patterns',
					collapsed: false,
					items: [
						{ text: 'Batch Processing', link: '/guide/batch-processing' },
						{ text: 'Loops', link: '/guide/loops' },
						{ text: 'Subflows', link: '/guide/subflows' },
					],
				},
				{
					text: 'Extending Flowcraft',
					collapsed: false,
					items: [
						{ text: 'Custom Loggers', link: '/guide/custom-loggers' },
						{ text: 'Evaluators', link: '/guide/evaluators' },
						{ text: 'Serializers', link: '/guide/serializers' },
						{ text: 'Middleware', link: '/guide/middleware' },
						{ text: 'Distributed Execution', link: '/guide/distributed-execution' },
					],
				},
				{
					text: 'Analysis and Debugging',
					collapsed: false,
					items: [
						{ text: 'Static Analysis', link: '/guide/static-analysis' },
						{ text: 'Visualizing Workflows', link: '/guide/visualizing-workflows' },
						{ text: 'Error Handling', link: '/guide/error-handling' },
					],
				},
			],
			'/examples/': [
				{
					text: 'Examples',
					items: [
						{ text: 'Simple Workflow', link: '/guide/examples/simple-workflow' },
						{ text: 'ETL Pipeline', link: '/guide/examples/etl-pipeline' },
						{ text: 'AI Agent Orchestration', link: '/guide/examples/ai-agent-orchestration' },
					],
				},
			],
			'/api-reference/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'Overview', link: '/api-reference/' },
						{ text: 'Flow', link: '/api-reference/flow' },
						{ text: 'Runtime', link: '/api-reference/runtime' },
						{ text: 'Nodes', link: '/api-reference/nodes' },
						{ text: 'Context', link: '/api-reference/context' },
						{ text: 'Analysis', link: '/api-reference/analysis' },
						{ text: 'Linter', link: '/api-reference/linter' },
						{ text: 'Serializer', link: '/api-reference/serializer' },
						{ text: 'Evaluator', link: '/api-reference/evaluator' },
						{ text: 'Logger', link: '/api-reference/logger' },
						{ text: 'Errors', link: '/api-reference/errors' },
						{ text: 'Distributed Adapter', link: '/api-reference/distributed-adapter' },
					],
				},
			],
		},
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/gorango/flowcraft' },
		],
	},
})
