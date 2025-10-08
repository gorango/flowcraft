import type { NodeArgs } from 'flowcraft'
import type { RagContext, RagNodeOptions, SearchResult } from '../types'
import { Node } from 'flowcraft'
import { callLLM, resolveTemplate } from '../utils'
import { FINAL_ANSWER, keyRegistry, SEARCH_RESULTS } from './index'

export class LLMProcessNode extends Node<string, string> {
	private data: RagNodeOptions<'llm-process'>['data']

	constructor(options: RagNodeOptions<'llm-process'> & RagContext) {
		super(options)
		this.data = options.data
	}

	async prep(args: NodeArgs): Promise<string> {
		const template = this.data.promptTemplate
		const templateData: Record<string, any> = {}

		for (const [templateKey, contextKeyString] of Object.entries(this.data.inputs)) {
			const keySymbol = keyRegistry.get(contextKeyString)
			if (keySymbol) {
				let value = await args.ctx.get(keySymbol as any)

				if (keySymbol === SEARCH_RESULTS) {
					const searchResults = value as SearchResult[] | undefined
					value = searchResults
						?.map(result => result.chunk.text)
						.join('\n\n---\n\n') ?? ''
				}

				templateData[templateKey] = value
			}
			else {
				args.logger.warn(`[LLMProcessNode] Unknown context key '${contextKeyString}' in graph definition.`)
			}
		}

		return Promise.resolve(resolveTemplate(template, templateData))
	}

	exec(args: NodeArgs<string>): Promise<string> {
		return callLLM(args.prepRes)
	}

	async post(args: NodeArgs<string, string>) {
		await args.ctx.set(FINAL_ANSWER, args.execRes)
	}
}
