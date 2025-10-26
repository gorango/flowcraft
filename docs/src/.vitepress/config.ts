import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vitepress'
// import llmstxt from 'vitepress-plugin-llms'
// import { copyOrDownloadAsMarkdownButtons } from 'vitepress-plugin-llms'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'

export default defineConfig({
	cleanUrls: true,
	title: 'flowcraft',
	description: 'A lightweight, unopinionated workflow engine for executing declarative graphs',
	vite: {
		optimizeDeps: {
			include: ['mermaid'],
		},
		plugins: [
			tailwindcss(),
			MermaidPlugin() as any,
			Components({
				dirs: [resolve(__dirname, './theme/components')],
				deep: true,
				directoryAsNamespace: true,
				extensions: ['vue', 'md'],
				include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
				dts: resolve(__dirname, '../components.d.ts'),
			}),
			AutoImport({
				imports: ['vue', '@vueuse/core'],
				dts: resolve(__dirname, '../auto-imports.d.ts'),
			}),
			// llmstxt(),
		],
	},
	markdown: {
		config: (md) => {
			MermaidMarkdown(md, {})
			// md.use(copyOrDownloadAsMarkdownButtons)
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
		['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-XR04CH71VC' }],
		[
			'script',
			{},
			`window.dataLayer = window.dataLayer || [];
			function gtag(){dataLayer.push(arguments);}
			gtag('js', new Date());
			gtag('config', 'G-XR04CH71VC');`,
		],
	],

	themeConfig: {
		search: { provider: 'local' },
		nav: [
			{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
			{ text: 'API', link: '/api/', activeMatch: '/api/' },
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/gorango/flowcraft' }],
		footer: {
			message: 'Released under the MIT License',
			copyright: 'Copyright © 2025-present',
		},
		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					collapsed: false,
					items: [
						{ text: 'What is Flowcraft?', link: '/guide/' },
						{ text: 'Getting Started', link: '/guide/getting-started' },
						{ text: 'Core Concepts', link: '/guide/core-concepts' },
						// {
						// 	text: 'Core Concepts', link: '/guide/core-concepts', items: [
						// 		{ text: 'Nodes and Edges', link: '/guide/nodes-and-edges' },
						// 		{ text: 'Context Management', link: '/guide/context-management' },
						// 	]
						// },
					],
				},
				{
					text: 'Building Workflows',
					collapsed: false,
					items: [
						{ text: 'Programmatic Flows', link: '/guide/programmatic' },
						{
							text: 'Declarative Flows',
							link: '/guide/declarative',
						},
					],
				},
				{
					text: 'Patterns',
					collapsed: false,
					items: [
						{ text: 'Batches', link: '/guide/batches' },
						{ text: 'Loops', link: '/guide/loops' },
						{ text: 'Awaitable', link: '/guide/awaitable' },
						{ text: 'Subflows', link: '/guide/subflows' },
					],
				},
				{
					text: 'Reliability',
					collapsed: false,
					items: [
						{ text: 'Static Analysis', link: '/guide/static-analysis' },
						{
							text: 'Visualizing Workflows',
							link: '/guide/visualizing-workflows',
						},
						{ text: 'Observability', link: '/guide/observability' },
						{ text: 'Error Handling', link: '/guide/error-handling' },
					],
				},
				{
					text: 'Validation',
					collapsed: false,
					items: [
						{ text: 'Testing', link: '/guide/testing' },
						{ text: 'Debugging', link: '/guide/debugging' },
					],
				},
				{
					text: 'Extending Flowcraft',
					collapsed: true,
					items: [
						{ text: 'Loggers', link: '/guide/loggers' },
						{ text: 'Middleware', link: '/guide/middleware' },
						{ text: 'Evaluators', link: '/guide/evaluators' },
						{ text: 'Serializers', link: '/guide/serializers' },
						{ text: 'Orchestrators', link: '/guide/orchestrators' },
					],
				},
				{
					text: 'Distributed Systems',
					collapsed: true,
					items: [
						{
							text: 'Introduction',
							link: '/guide/distributed-execution',
						},
						{
							text: 'Official Adapters',
							// collapsed: false,
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
			'/api/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'Overview', link: '/api/' },
					],
				},
				{
					text: 'Core API',
					collapsed: false,
					items: [
						{ text: 'Flow', link: '/api/flow' },
						{ text: 'Runtime', link: '/api/runtime' },
						{ text: 'Nodes and Edges', link: '/api/nodes-and-edges' },
						{ text: 'Context', link: '/api/context' },
						{ text: 'DI Container', link: '/api/container' },
						{ text: 'Errors', link: '/api/errors' },
					]
				},
				{
					text: 'Extensibility',
					collapsed: false,
					items: [
						{ text: 'Orchestrators', link: '/api/orchestrators' },
						{ text: 'Middleware', link: '/api/middleware' },
						{ text: 'Serializer', link: '/api/serializer' },
						{ text: 'Evaluator', link: '/api/evaluator' },
						{ text: 'Logger', link: '/api/logger' },
						{ text: 'Distributed Adapter', link: '/api/distributed-adapter' },
					]
				},
				{
					text: 'Tooling',
					collapsed: false,
					items: [
						{ text: 'Analysis', link: '/api/analysis' },
						{ text: 'Linter', link: '/api/linter' },
						{ text: 'Testing', link: '/api/testing' },
					]
				}
			],
		},
	},
})
