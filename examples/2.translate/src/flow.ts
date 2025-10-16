import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { NodeContext, NodeResult } from 'flowcraft'
import { createFlow } from 'flowcraft'
import { callLLM } from './utils.js'

interface TranslationContext {
	text: string
	languages: string[]
	output_dir: string
	'prepare-jobs': { language: string; text: string }[]
	translations: { language: string; translation: string }[]
	'translate-batch_gather_allWorkerIds': string[]
}

// 1. Prepare the list of translation jobs
async function prepareJobs(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	const languages = await ctx.context.get('languages')
	const text = await ctx.context.get('text')
	if (!languages || !text) {
		throw new TypeError('languages and text are required')
	}
	const jobs = languages.map((language) => ({ language, text }))
	await ctx.context.set('prepare-jobs', jobs)
	return { output: jobs }
}

// 2. This function will be executed FOR EACH item in the batch
async function translateItem(
	ctx: NodeContext<TranslationContext, any, { language: string; text: string }>,
): Promise<NodeResult<{ language: string; translation: string }>> {
	// The `input` for a batch worker is a single item from the source array.
	const input = ctx.input
	if (!input) {
		throw new Error('Input is required for translation worker')
	}
	const { language, text } = input
	const prompt = `
Translate the following markdown text into ${language}.
Preserve markdown formatting, links, and code blocks.
Return only the translated text.

Original Text:
${text}`

	console.log(`Translating to ${language}...`)
	const translation = await callLLM(prompt)
	console.log(`✓ Finished ${language}`)
	// console.log(`Translation for ${language}:`, translation.substring(0, 100) + '...')
	return { output: { language, translation } }
}

// 3. This node runs AFTER the entire batch is complete
async function saveResults(ctx: NodeContext<TranslationContext>): Promise<NodeResult<string>> {
	const outputDir = await ctx.context.get('output_dir')
	if (!outputDir) {
		throw new TypeError('output_dir is required')
	}

	// Collect translations from worker outputs in context
	const allWorkerIds = (await ctx.context.get('translate-batch_gather_allWorkerIds')) || []
	const collectedTranslations: { language: string; translation: string }[] = []
	for (const workerId of allWorkerIds) {
		const trans = await ctx.context.get(workerId as keyof TranslationContext)
		if (trans && typeof trans === 'object' && 'language' in trans && 'translation' in trans) {
			collectedTranslations.push(trans as { language: string; translation: string })
		}
	}

	if (!collectedTranslations || collectedTranslations.length === 0) {
		console.warn('No translations to save.')
		return { output: 'Saved 0 files.' }
	}

	const promises = collectedTranslations.map(({ language, translation }) => {
		const filename = path.join(outputDir, `README_${language.toUpperCase()}.md`)
		console.log(`Saving translation to ${filename}`)
		return fs.writeFile(filename, translation, 'utf-8')
	})

	await Promise.all(promises)
	return { output: `Saved ${collectedTranslations.length} files.` }
}

export function createTranslateFlow() {
	const flow = createFlow<TranslationContext>('parallel-translation')

	// Define all the nodes first
	flow.node('prepare-jobs', prepareJobs)
	flow.node('save-results', saveResults, { inputs: 'translations' })

	// The batch operation creates 'translate-batch_scatter' and 'translate-batch_gather' nodes.
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
