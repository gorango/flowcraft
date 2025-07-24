import type { NodeArgs } from 'cascade'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Node, ParallelBatchFlow } from 'cascade'
import { callLLM } from './utils'

export class TranslateNode extends Node<void, { language: string, translation: string }> {
	async exec({ params }: NodeArgs) {
		const { text, language } = params
		const prompt = `
Translate the following markdown text into ${language}.
Preserve markdown formatting, links, and code blocks.
Return only the translated text.

Original Text:
${text}`
		console.log(`Translating to ${language}...`)
		const translation = await callLLM(prompt)
		console.log(`✓ Finished ${language}`)
		return { language, translation }
	}

	async post({ ctx, execRes }: NodeArgs<void, { language: string, translation: string }>) {
		const { language, translation } = execRes
		const outputDir = ctx.get('output_dir')!
		const filename = path.join(outputDir, `README_${language.toUpperCase()}.md`)
		await fs.writeFile(filename, translation, 'utf-8')
		console.log(`Saved translation to ${filename}`)
	}
}

export class TranslateFlow extends ParallelBatchFlow {
	async prep({ ctx }: NodeArgs): Promise<any[]> {
		const languages = ctx.get('languages')!
		const text = ctx.get('text')
		return languages.map((language: string) => ({
			language,
			text,
		}))
	}
}
