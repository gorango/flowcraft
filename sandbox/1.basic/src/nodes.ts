import type { NodeArgs } from 'cascade'
import { BatchFlow, contextKey, Node } from 'cascade'
import yaml from 'yaml'
import { callLLM } from './utils'

export const TOPIC = contextKey<string>('topic')
export const SECTIONS = contextKey<string[]>('sections')
export const DRAFT = contextKey<string>('draft')
export const FINAL_ARTICLE = contextKey<string>('final_article')
export const SECTION_CONTENTS = contextKey<Record<string, string>>('section_contents')

/**
 * Generates an article outline from a topic in the context.
 */
export class GenerateOutlineNode extends Node<string, { sections: string[] }> {
	async prep({ ctx }: NodeArgs): Promise<string> {
		return ctx.get(TOPIC)!
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

	async post({ ctx, execRes }: NodeArgs<string, { sections: string[] }>) {
		console.log('\n===== PARSED OUTLINE =====')
		execRes.sections.forEach((s, i) => console.log(`${i + 1}. ${s}`))
		console.log('==========================\n')
		ctx.set(SECTIONS, execRes.sections)
	}
}

/**
 * A BatchFlow that orchestrates writing content for each section of the outline.
 */
export class WriteContentNode extends BatchFlow {
	async prep({ ctx }: NodeArgs) {
		const sections = ctx.get(SECTIONS) || []
		return sections.map(section => ({ section }))
	}

	async post({ ctx }: NodeArgs) {
		const sectionContents = ctx.get(SECTION_CONTENTS) || {}
		const draft = (ctx.get(SECTIONS) || []).map(section =>
			`## ${section}\n\n${sectionContents[section]}\n`,
		).join('\n')
		ctx.set(DRAFT, draft)

		console.log('\n===== SECTION CONTENTS =====\n')
		for (const section in sectionContents)
			console.log(`--- ${section} ---\n${sectionContents[section]}\n`)

		console.log('============================\n')
	}
}

/**
 * Writes content for a single section, intended to be run by the WriteContentNode batch flow.
 */
export class WriteSingleSectionNode extends Node<string, string> {
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

	async post({ ctx, prepRes: section, execRes: content }: NodeArgs<string, string>) {
		const contents = ctx.get(SECTION_CONTENTS) || {}
		contents[section] = content
		ctx.set(SECTION_CONTENTS, contents)
	}
}

/**
 * Applies a final style pass to the complete draft article.
 */
export class ApplyStyleNode extends Node<string, string> {
	async prep({ ctx }: NodeArgs): Promise<string> {
		return ctx.get(DRAFT) || ''
	}

	async exec({ prepRes: draft }: NodeArgs<string>): Promise<string> {
		const prompt = `
Rewrite the following draft in a conversational, engaging style.
Make it warm in tone, include rhetorical questions, and add a strong opening and conclusion.

${draft}`
		return callLLM(prompt)
	}

	async post({ ctx, execRes: finalArticle }: NodeArgs<string, string>) {
		ctx.set(FINAL_ARTICLE, finalArticle)
		console.log('\n===== FINAL ARTICLE =====\n')
		console.log(finalArticle)
		console.log('\n=========================\n')
	}
}
