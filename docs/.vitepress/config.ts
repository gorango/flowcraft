import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true,
	title: 'flowcraft',
	description: 'A lightweight, unopinionated workflow framework for executing declarative DAGs',
	vite: {
		optimizeDeps: {
			include: ['mermaid'],
		},
		plugins: [MermaidPlugin() as any],
	},
	markdown: {
		config: (md) => {
			MermaidMarkdown(md, {})
		},
	},
	head: [
		['link', { rel: 'icon', href: '/logo.svg', sizes: 'any', type: 'image/svg+xml' }],
		['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
		['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
		[
			'link',
			{ href: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap', rel: 'stylesheet' },
		],
	],
	themeConfig: {
		search: { provider: 'local' },
		nav: [
			{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
			{ text: 'Examples', link: '/examples/', activeMatch: '/examples/' },
			{ text: 'API', link: '/api/', activeMatch: '/api/' },
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/gorango/flowcraft' }],
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2025-present @gorango',
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
						{
							text: 'Declarative Workflows',
							link: '/guide/declarative-workflows',
						},
						{ text: 'Static Analysis', link: '/guide/static-analysis' },
						{
							text: 'Visualizing Workflows',
							link: '/guide/visualizing-workflows',
						},
						{ text: 'Testing and Debugging', link: '/guide/testing' },
						{ text: 'Error Handling', link: '/guide/error-handling' },
						// { text: 'Best Practices', link: '/guide/best-practices' },
					],
				},
				{
					text: 'Extending Flowcraft',
					collapsed: true,
					items: [
						{ text: 'Loggers', link: '/guide/loggers' },
						{ text: 'Evaluators', link: '/guide/evaluators' },
						{ text: 'Serializers', link: '/guide/serializers' },
						{ text: 'Middleware', link: '/guide/middleware' },
						{ text: 'Orchestrators', link: '/guide/orchestrators' },
						{
							text: 'Distributed Execution',
							link: '/guide/distributed-execution',
						},
						{
							text: 'Official Adapters',
							collapsed: true,
							link: '/guide/adapters/',
							items: [
								{ text: 'BullMQ', link: '/guide/adapters/bullmq' },
								{ text: 'AWS (SQS)', link: '/guide/adapters/sqs' },
								{ text: 'GCP (Pub/Sub)', link: '/guide/adapters/gcp' },
								{ text: 'Azure (Queues)', link: '/guide/adapters/azure' },
								{
									text: 'RabbitMQ & PostgreSQL',
									link: '/guide/adapters/rabbitmq',
								},
								{ text: 'Kafka & Cassandra', link: '/guide/adapters/kafka' },
							],
						},
					],
				},
			],
			'/examples/': [
				{
					text: 'Examples',
					items: [
						{ text: 'Overview', link: '/examples/' },
						{ text: 'Basic Workflow', link: '/examples/1_basic' },
						{ text: 'Parallel Workflow', link: '/examples/2_translate' },
						{ text: 'Research Agent', link: '/examples/3_research' },
						{
							text: 'Declarative Workflow',
							items: [
								{ text: 'In-Memory', link: '/examples/4a_declarative-in-memory' },
								{ text: 'Distributed', link: '/examples/4b_declarative-distributed' },
							],
						},
						{ text: 'RAG Agent', link: '/examples/5_rag' },
					],
				},
			],
			'/api/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'Overview', link: '/api/' },
						{ text: 'Flow', link: '/api/flow' },
						{ text: 'Runtime', link: '/api/runtime' },
						{ text: 'Orchestrators', link: '/api/orchestrators' },
						{ text: 'Nodes and Edges', link: '/api/nodes-and-edges' },
						{ text: 'Context', link: '/api/context' },
						{ text: 'Analysis', link: '/api/analysis' },
						{ text: 'Linter', link: '/api/linter' },
						{ text: 'Middleware', link: '/api/middleware' },
						{ text: 'Serializer', link: '/api/serializer' },
						{ text: 'Evaluator', link: '/api/evaluator' },
						{ text: 'Logger', link: '/api/logger' },
						{ text: 'Errors', link: '/api/errors' },
						{ text: 'Distributed Adapter', link: '/api/distributed-adapter' },
					],
				},
			],
		},
	},
})
