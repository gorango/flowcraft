import type { NodeContext, NodeResult } from 'flowcraft/v2'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createFlow } from 'flowcraft/v2'
import { callLLM } from './utils.js'

interface TranslationContext {
	text: string
	languages: string[]
	output_dir: string
}

// 1. Prepare the list of translation jobs
async function prepareJobs(ctx: NodeContext<TranslationContext>): Promise<NodeResult> {
	const languages = ctx.get('languages')!
	const text = ctx.get('text')!
	// The output of this node is an array of objects, which the batch processor will iterate over.
	const jobs = languages.map(language => ({ language, text }))
	return { output: jobs }
}

// 2. This function will be executed FOR EACH item in the batch
async function translateItem(ctx: NodeContext<{ language: string, text: string }>): Promise<NodeResult> {
	// The `input` for a batch worker is a single item from the source array.
	const { language, text } = ctx.input!
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
async function saveResults(ctx: NodeContext): Promise<NodeResult> {
	// The `input` for the successor of a batch is an array of all worker outputs.
	const translations = ctx.input as { language: string, translation: string }[]
	const outputDir = ctx.get('output_dir')!

	const promises = translations.map(({ language, translation }) => {
		const filename = path.join(outputDir, `README_${language.toUpperCase()}.md`)
		console.log(`Saving translation to ${filename}`)
		return fs.writeFile(filename, translation, 'utf-8')
	})

	await Promise.all(promises)
	return { output: `Saved ${translations.length} files.` }
}

export function createTranslateFlow() {
	const flow = createFlow<TranslationContext>('parallel-translation')

	flow.node('prepare-jobs', prepareJobs)
	flow.node('translate-item', translateItem) // The "worker" function for the batch
	flow.node('save-results', saveResults)

	// The batch helper wires `prepare-jobs` to the internal batch processor.
	// The processor then invokes `translate-item` for each item.
	flow.batch(
		'prepare-jobs', // Source node providing the array
		'translate-item', // Node to execute for each item
		{ concurrency: 5 }, // Run up to 5 translations at once
	)

	// This is the key change: you define the edge from the logical worker.
	// The runtime knows to execute this edge only after all batch items are done.
	flow.edge('translate-item', 'save-results')

	return flow
}
