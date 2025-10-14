import type { NodeContext, NodeResult } from 'flowcraft'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createFlow } from 'flowcraft'
import { callLLM } from './utils.js'

interface TranslationContext {
	'text': string
	'languages': string[]
	'output_dir': string
	'prepare-jobs': { language: string, text: string }[]
	'translations': { language: string, translation: string }[]
}

// 1. Prepare the list of translation jobs
async function prepareJobs(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	const languages = (await ctx.context.get('languages'))!
	const text = (await ctx.context.get('text'))!
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
	const outputDir = (await ctx.context.get('output_dir'))!

	if (!translations || translations.length === 0) {
		console.warn('No translations to save.')
		return { output: 'Saved 0 files.' }
	}

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

	// Define all the nodes first
	flow.node('prepare-jobs', prepareJobs)
		.node('save-results', saveResults, { inputs: 'translations' })

	// Define the batch operation.
	// This implicitly creates 'translate-batch_scatter' and 'translate-batch_gather' nodes.
	flow.batch('translate-batch', translateItem, {
		// The scatter node will read its list of items from the context key 'prepare-jobs',
		// which is the output of the node with that ID.
		inputKey: 'prepare-jobs',
		// The gather node will collect all worker results into an array and place it
		// in the context under the key 'translations'.
		outputKey: 'translations',
	})

	// Wire the graph edges to define the sequence of execution.
	// 1. Run 'prepare-jobs' first.
	// 2. The output of 'prepare-jobs' is used by 'translate-batch_scatter'.
	// 3. When 'translate-batch_gather' is complete, run 'save-results'.
	flow.edge('prepare-jobs', 'translate-batch_scatter')
	flow.edge('translate-batch_gather', 'save-results')

	return flow
}
