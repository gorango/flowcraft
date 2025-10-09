import type { NodeContext, NodeResult } from 'flowcraft'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createFlow } from 'flowcraft'
import { callLLM } from './utils.js'

interface TranslationContext {
	text: string
	languages: string[]
	output_dir: string
}

// 1. Prepare the list of translation jobs
async function prepareJobs(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	const languages = await ctx.context.get('languages') as string[]
	const text = await ctx.context.get('text') as string
	// The output of this node is an array of objects, which the batch processor will iterate over.
	const jobs = languages.map(language => ({ language, text }))
	return { output: jobs }
}

// 2. This function will be executed FOR EACH item in the batch
async function translateItem(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	// The `input` for a batch worker is a single item from the source array.
	const { language, text } = ctx.input as { language: string, text: string }
	const prompt = `
Translate the following markdown text into ${language}.
Preserve markdown formatting, links, and code blocks.
Return only the translated text.

Original Text:
${text}`

	console.log(`Translating to ${language}...`)
	const translation = await callLLM(prompt)
	console.log(`✓ Finished ${language}`)
	return { output: { language, translation } }
}

// 3. This node runs AFTER the entire batch is complete
async function saveResults(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	// The `input` for the successor of a batch is an array of all worker outputs.
	const translations = ctx.input as { language: string, translation: string }[]
	const outputDir = await ctx.context.get('output_dir')!

	const promises = translations.map(({ language, translation }) => {
		const filename = path.join(outputDir!, `README_${language.toUpperCase()}.md`)
		console.log(`Saving translation to ${filename}`)
		return fs.writeFile(filename, translation, 'utf-8')
	})

	await Promise.all(promises)
	return { output: `Saved ${translations.length} files.` }
}

export function createTranslateFlow() {
	const flow = createFlow<TranslationContext>('parallel-translation')

	flow.node('prepare-jobs', prepareJobs)
	// Don't register translate-item as a regular node - it's only used as a batch worker
	flow.node('save-results', saveResults)

	// Use the new batch method with the worker function
	flow.batch('prepare-jobs', 'save-results', translateItem, { concurrency: 8 })

	return flow
}
