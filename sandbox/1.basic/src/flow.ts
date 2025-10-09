import { createFlow } from 'flowcraft'
import yaml from 'yaml'
import { callLLM } from './utils.js'

// Define the shape of the data that flows between nodes
interface ArticleContext {
	topic: string
	outline: { sections: string[] }
	draft: string
	titles: string
	final_output: string
}

export function createArticleFlow() {
	return createFlow<ArticleContext>('article-generation')
		.node('generate-outline', async (ctx) => {
			const topic = ctx.input as string
			console.log('\n===== GENERATING OUTLINE =====')
			const prompt
				= `
				Create a simple outline for an article about "${topic}".
				Include at most 3 main sections (no subsections).
				Output the sections in YAML format as a list under the key "sections".
			`.replace(/\t/g, '').trim()
			const response = await callLLM(prompt)
			const structuredResult = yaml.parse(response)
			console.log('==========================\n')
			return { output: structuredResult }
		})
		.node('draft-post', async (ctx) => {
			const outline = (ctx.input as { sections: string[] }).sections.join('\n- ')
			console.log('\n===== DRAFTING POST =====')
			const prompt = `Write a full-length, engaging blog post based on the following outline:\n\n- ${outline}`
			const draft = await callLLM(prompt)
			console.log('=========================\n')
			return { output: draft }
		})
		.node('suggest-titles', async (ctx) => {
			const draft = ctx.input as string
			console.log('\n===== SUGGESTING TITLES =====')
			const prompt = `Suggest 5 catchy, SEO-friendly titles for the following blog post. Respond with a simple numbered list.\n\nPost:\n${draft}`
			const titles = await callLLM(prompt)
			console.log('============================\n')
			return { output: titles }
		})
		.node('apply-style', async (ctx) => {
			const draft = await ctx.context.get('draft-post')
			console.log('\n===== APPLYING STYLE =====')
			const prompt
				= `
				Rewrite the following draft in a conversational, engaging style.
				Make it warm in tone, include rhetorical questions, and add a strong opening and conclusion.

				${draft}
			`.replace(/\t/g, '').trim()
			const finalArticle = await callLLM(prompt)
			console.log('=========================\n')
			return { output: finalArticle }
		})
		// Define the sequence of execution
		.edge('generate-outline', 'draft-post')
		.edge('draft-post', 'suggest-titles')
		.edge('suggest-titles', 'apply-style')
}
