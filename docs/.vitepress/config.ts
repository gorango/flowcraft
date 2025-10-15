import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true,
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
		search: { provider: 'local' },
		nav: [
			{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
			{ text: 'Examples', link: '/examples/', activeMatch: '/examples/' },
			{ text: 'API', link: '/api/', activeMatch: '/api/' },
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/gorango/flowcraft' }],
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
						{
							text: 'Declarative Workflows',
							link: '/guide/declarative-workflows',
						},
					],
				},
				{
					text: 'Extending Flowcraft',
					collapsed: true,
					items: [
						{ text: 'Custom Loggers', link: '/guide/custom-loggers' },
						{ text: 'Evaluators', link: '/guide/evaluators' },
						{ text: 'Serializers', link: '/guide/serializers' },
						{ text: 'Middleware', link: '/guide/middleware' },
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
				{
					text: 'Analysis and Debugging',
					collapsed: true,
					items: [
						{ text: 'Static Analysis', link: '/guide/static-analysis' },
						{
							text: 'Visualizing Workflows',
							link: '/guide/visualizing-workflows',
						},
						{ text: 'Error Handling', link: '/guide/error-handling' },
					],
				},
			],
			'/examples/': [
				{
					text: 'Examples',
					items: [
						{ text: 'Overview', link: '/examples/' },
						{ text: 'Basic Workflow', link: '/examples/1_basic' },
						{ text: 'RAG Agent', link: '/examples/2_rag' },
						{ text: 'Parallel Workflow', link: '/examples/3_translate' },
						{ text: 'Research Agent', link: '/examples/4_research' },
						{
							text: 'Declarative Workflow',
							items: [
								{ text: 'In-Memory', link: '/examples/5a_declarative' },
								{ text: 'Distributed', link: '/examples/5b_distributed' },
							],
						},
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
						{ text: 'Nodes', link: '/api/nodes' },
						{ text: 'Context', link: '/api/context' },
						{ text: 'Analysis', link: '/api/analysis' },
						{ text: 'Linter', link: '/api/linter' },
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
