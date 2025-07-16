import type { NodeArgs } from 'workflow'
import { DEFAULT_ACTION, Node } from 'workflow'
import yaml from 'yaml'
import { callLLM, searchWeb } from './utils.js'

interface Decision {
	action: 'search' | 'answer'
	reason: string
	search_query?: string
}

interface DecidePrepRes {
	question: string
	context: string
	searchCount: number
	maxSearches: number
}

export class DecideActionNode extends Node<DecidePrepRes, Decision, string> {
	async prep({ ctx }: NodeArgs) {
		const question = ctx.get<string>('question')!
		const context = ctx.get<string>('context') || 'No previous search results.'
		const searchCount = ctx.get<number>('searchCount') || 0
		const maxSearches = ctx.get<number>('maxSearches') ?? 2
		return { question, context, searchCount, maxSearches }
	}

	async exec({ prepRes }: NodeArgs<DecidePrepRes>) {
		const { question, context, searchCount, maxSearches } = prepRes
		const prompt = `
You are a research assistant. Based on the question, context, and the number of searches performed, decide whether to search for more information or answer the question.

Question: "${question}"

Context:
${context}

Number of searches performed so far: ${searchCount}

RULES:
1. If the context contains a clear answer to the question, choose 'answer'.
2. If the context is insufficient, choose 'search'.
3. **ESCAPE HATCH**: If the number of searches is ${maxSearches} or greater, you MUST choose 'answer' to avoid getting stuck in a loop.

Return your decision in YAML format inside a markdown code block.
Your response must include "action" ('search' or 'answer') and a "reason".
If the action is 'search', you MUST include a "search_query".`

		const response = await callLLM(prompt)
		const yamlMatch = response.match(/```(?:yaml)?\n([\s\S]*?)\n```/)
		return yaml.parse(yamlMatch ? yamlMatch[1] : response) as Decision
	}

	async post({ ctx, execRes: decision }: NodeArgs<any, Decision>): Promise<string> {
		console.log(`\n🤔 Agent decides to ${decision?.action}. Reason: ${decision?.reason}`)
		if (decision?.action === 'search') {
			ctx.set('search_query', decision?.search_query)
			console.log(`🔍 Search Query: ${decision?.search_query}`)
		}
		return decision?.action ?? DEFAULT_ACTION
	}
}

export class SearchWebNode extends Node<string, string, string> {
	async prep({ ctx }: NodeArgs) {
		return ctx.get<string>('search_query')!
	}

	async exec({ prepRes: query }: NodeArgs<string>) {
		return searchWeb(query)
	}

	async post({ ctx, prepRes: query, execRes: searchResults }: NodeArgs<string, string>) {
		const currentContext = ctx.get('context') || ''
		const newContext = `${currentContext}\n\nSearch for "${query}":\n${searchResults}`
		ctx.set('context', newContext)

		const count = ctx.get<number>('searchCount') || 0
		ctx.set('searchCount', count + 1)

		console.log(`📚 Found information (Search #${count + 1}), analyzing results...`)
		return 'decide'
	}
}

export class AnswerQuestionNode extends Node<{ question: string, context: string }, string> {
	async prep({ ctx }: NodeArgs) {
		const question = ctx.get<string>('question')!
		const context = ctx.get<string>('context') || 'No context provided.'
		return { question, context }
	}

	async exec({ prepRes }: NodeArgs<{ question: string, context: string }>) {
		const { question, context } = prepRes
		const prompt = `Based on the following context, provide a comprehensive answer to the question.
Context:
${context}

Question: "${question}"`
		console.log('✍️  Crafting final answer...')
		return callLLM(prompt)
	}

	async post({ ctx, execRes: answer }: NodeArgs<any, string>) {
		ctx.set('answer', answer)
		console.log('✅ Answer generated successfully.')
		return DEFAULT_ACTION
	}
}
