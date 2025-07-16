import type { Context, Params } from 'workflow'
import { BatchFlow, DEFAULT_ACTION, Node } from 'workflow'
import yaml from 'yaml'
import { callLLM } from './utils'

export class GenerateOutlineNode extends Node<string, { sections: string[] }> {
	prep(ctx: Context) {
		return ctx.get('topic')
	}

	exec(topic: string) {
		const prompt = `
Create a simple outline for an article about "${topic}".
Include at most 3 main sections (no subsections).
Output the sections in YAML format as a list under the key "sections".`
		const response = callLLM(prompt)
		const structuredResult = yaml.parse(response)
		return structuredResult
	}

	post(ctx: Context, _: any, execRes: { sections: string[] }) {
		console.log('\n===== PARSED OUTLINE =====')
		execRes.sections.forEach((s, i) => console.log(`${i + 1}. ${s}`))
		console.log('==========================\n')
		ctx.set('sections', execRes.sections)
		return DEFAULT_ACTION
	}
}

export class WriteContentNode extends BatchFlow {
	prep(ctx: Context): any[] {
		const sections = ctx.get('sections') || []
		return sections.map((section: string) => ({ section }))
	}

	post(ctx: Context, prepRes: any[], execRes: any): any {
		const sectionContents = ctx.get('section_contents') || {}
		const draft = (ctx.get('sections') || []).map((section: string) =>
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

export class WriteSingleSectionNode extends Node<string, string> {
	prep(_: Context, params: Params) {
		return params.section
	}

	exec(section: string) {
		const prompt = `
Write a short paragraph (MAXIMUM 100 WORDS) about this section: "${section}".
Explain the idea in simple, easy-to-understand terms, avoiding jargon.
Include one brief example or analogy.`
		const content = callLLM(prompt)
		console.log(`✓ Completed section: ${section}`)
		return content
	}

	post(ctx: Context, section: string, content: string) {
		const contents = ctx.get('section_contents') || {}
		contents[section] = content
		ctx.set('section_contents', contents)
		return DEFAULT_ACTION
	}
}

export class ApplyStyleNode extends Node<string, string> {
	prep(ctx: Context): string {
		return ctx.get('draft') || ''
	}

	exec(draft: string) {
		const prompt = `
Rewrite the following draft in a conversational, engaging style.
Make it warm in tone, include rhetorical questions, and add a strong opening and conclusion.

${draft}`
		return callLLM(prompt)
	}

	post(ctx: Context, _: any, finalArticle: string) {
		ctx.set('final_article', finalArticle)
		console.log('\n===== FINAL ARTICLE =====\n')
		console.log(finalArticle)
		console.log('\n=========================\n')
		return DEFAULT_ACTION
	}
}
