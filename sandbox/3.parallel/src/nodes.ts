import type { NodeArgs } from 'workflow'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { DEFAULT_ACTION, Flow, Node } from 'workflow'
import { callLLM } from './utils'

class ParallelBatchFlow extends Flow {
	async prep(args: NodeArgs): Promise<Iterable<any>> { return [] }
	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`ParallelBatchFlow: Starting parallel processing of ${batchParamsList.length} items.`)
		const promises = batchParamsList.map(batchParams =>
			this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger),
		)
		await Promise.all(promises)
		return null
	}
}

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
		const outputDir = ctx.get<string>('output_dir')!
		const filename = path.join(outputDir, `README_${language.toUpperCase()}.md`)
		await fs.writeFile(filename, translation, 'utf-8')
		console.log(`Saved translation to ${filename}`)
		return DEFAULT_ACTION
	}
}

export class TranslateFlow extends ParallelBatchFlow {
	async prep({ ctx }: NodeArgs): Promise<any[]> {
		const languages = ctx.get<string>('languages')!
		const text = ctx.get('text')
		return languages.map((language: string) => ({
			language,
			text,
		}))
	}
}
