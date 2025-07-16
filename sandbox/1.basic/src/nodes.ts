import type { NodeArgs } from 'workflow'
import { DEFAULT_ACTION, Flow, Node } from 'workflow'
import yaml from 'yaml'
import { callLLM } from './utils'

/**
 * A custom Flow that processes a batch of items sequentially.
 */
export class BatchFlow extends Flow {
	async prep(args: NodeArgs): Promise<Iterable<any>> { return [] }
	async exec(args: NodeArgs): Promise<null> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`BatchFlow: Starting sequential processing of ${batchParamsList.length} items.`)
		for (const [index, batchParams] of batchParamsList.entries()) {
			args.logger.debug(`BatchFlow: Processing item ${index + 1}/${batchParamsList.length}.`, { params: batchParams })
			await this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger)
		}
		return null
	}
}

/**
 * Generates an article outline from a topic in the context.
 */
export class GenerateOutlineNode extends Node<string, { sections: string[] }, string> {
	async prep({ ctx }: NodeArgs): Promise<string> {
		return ctx.get<string>('topic')!
	}

	async exec({ prepRes: topic }: NodeArgs<string>): Promise<{ sections: string[] }> {
		const prompt = `
Create a simple outline for an article about "${topic}".
Include at most 3 main sections (no subsections).
Output the sections in YAML format as a list under the key "sections".`
		const response = callLLM(prompt)
		const structuredResult = yaml.parse(response)
		return structuredResult
	}

	async post({ ctx, execRes }: NodeArgs<string, { sections: string[] }>): Promise<string> {
		console.log('\n===== PARSED OUTLINE =====')
		execRes.sections.forEach((s, i) => console.log(`${i + 1}. ${s}`))
		console.log('==========================\n')
		ctx.set('sections', execRes.sections)
		return DEFAULT_ACTION
	}
}

/**
 * A BatchFlow that orchestrates writing content for each section of the outline.
 */
export class WriteContentNode extends BatchFlow {
	async prep({ ctx }: NodeArgs): Promise<Iterable<{ section: string }>> {
		const sections = ctx.get<string[]>('sections') || []
		return sections.map(section => ({ section }))
	}

	async post({ ctx }: NodeArgs): Promise<string> {
		const sectionContents = ctx.get<Record<string, string>>('section_contents') || {}
		const draft = (ctx.get<string[]>('sections') || []).map(section =>
			`## ${section}\n\n${sectionContents[section]}\n`,
		).join('\n')
		ctx.set('draft', draft)

		console.log('\n===== SECTION CONTENTS =====\n')
		for (const section in sectionContents)
			console.log(`--- ${section} ---\n${sectionContents[section]}\n`)

		console.log('============================\n')
		return DEFAULT_ACTION
	}
}

/**
 * Writes content for a single section, intended to be run by the WriteContentNode batch flow.
 */
export class WriteSingleSectionNode extends Node<string, string, string> {
	async prep({ params }: NodeArgs): Promise<string> {
		return params.section
	}

	async exec({ prepRes: section }: NodeArgs<string>): Promise<string> {
		const prompt = `
Write a short paragraph (MAXIMUM 100 WORDS) about this section: "${section}".
Explain the idea in simple, easy-to-understand terms, avoiding jargon.
Include one brief example or analogy.`
		const content = callLLM(prompt)
		console.log(`✓ Completed section: ${section}`)
		return content
	}

	async post({ ctx, prepRes: section, execRes: content }: NodeArgs<string, string>): Promise<string> {
		const contents = ctx.get<Record<string, string>>('section_contents') || {}
		contents[section] = content
		ctx.set('section_contents', contents)
		return DEFAULT_ACTION
	}
}

/**
 * Applies a final style pass to the complete draft article.
 */
export class ApplyStyleNode extends Node<string, string, string> {
	async prep({ ctx }: NodeArgs): Promise<string> {
		return ctx.get('draft') || ''
	}

	async exec({ prepRes: draft }: NodeArgs<string>): Promise<string> {
		const prompt = `
Rewrite the following draft in a conversational, engaging style.
Make it warm in tone, include rhetorical questions, and add a strong opening and conclusion.

${draft}`
		return callLLM(prompt)
	}

	async post({ ctx, execRes: finalArticle }: NodeArgs<string, string>): Promise<string> {
		ctx.set('final_article', finalArticle)
		console.log('\n===== FINAL ARTICLE =====\n')
		console.log(finalArticle)
		console.log('\n=========================\n')
		return DEFAULT_ACTION
	}
}
