import { createFlow } from '../../../src/v2/flow.js'

interface ArticleContext {
	title?: string
	sections?: string[]
	content?: Record<string, string>
	draft?: any
}

export function createArticleFlowV2() {
	return createFlow<ArticleContext>('article-generation')
		.node('generate-outline', async ({ get, input }) => {
			// Generate outline logic
			const sections = [
				'Introduction',
				'Main Content',
				'Conclusion',
			]

			return {
				output: {
					title: input?.title || 'Untitled Article',
					sections,
				},
			}
		})
		.node('write-content', async ({ get, input }) => {
			// Write content for each section
			const content: Record<string, string> = {}

			for (const section of input.sections || []) {
				content[section] = `Content for ${section} section...`
			}

			return {
				output: {
					title: input.title,
					content,
				},
			}
		})
		.node('assemble-draft', async ({ get, input }) => {
			// Assemble the draft
			const draft = {
				title: input.title,
				sections: Object.entries(input.content || {}).map(([section, content]) => ({
					title: section,
					content,
				})),
			}

			return {
				output: draft,
			}
		})
		.node('apply-style', async ({ get, input }) => {
			// Apply styling
			return {
				output: {
					...input,
					styled: true,
					publishedAt: new Date(),
				},
			}
		})
}
