import type { NodeContext, NodeResult } from 'flowcraft'
import { createFlow } from 'flowcraft'
import yaml from 'yaml'
import { callLLM, searchWeb } from './utils.js'

// Define the shape of the data that flows between nodes
interface ResearchContext {
	question: string
	context: string
	search_count: number
	max_searches: number
	search_query?: string
	answer?: string
}

interface Decision {
	action: 'search' | 'answer'
	reason: string
	search_query?: string
}

// Node to decide the next step
async function decideAction(ctx: NodeContext<ResearchContext>): Promise<NodeResult> {
	const question = (await ctx.context.get('question'))!
	const context = (await ctx.context.get('context')) || 'No previous search results.'
	const search_count = (await ctx.context.get('search_count')) || 0
	const max_searches = (await ctx.context.get('max_searches'))!

	const prompt = `
You are a research assistant. Based on the question, context, and the number of searches performed, decide whether to search for more information or answer the question.

Question: "${question}"
Context:
${context}
Number of searches performed so far: ${search_count}

RULES:
1. If the context contains a clear answer to the question, choose 'answer'.
2. If the context is insufficient, choose 'search'.
3. **ESCAPE HATCH**: If the number of searches is ${max_searches} or greater, you MUST choose 'answer'.

Return your decision in YAML format with "action" and "reason". If action is 'search', include "search_query".`

	const response = await callLLM(prompt)
	const decision = yaml.parse(response) as Decision

	console.log(`\n🤔 Agent decides to ${decision.action}. Reason: ${decision.reason}`)
	if (decision.action === 'search' && decision.search_query) {
		await ctx.context.set('search_query', decision.search_query)
		console.log(`🔍 Search Query: ${decision.search_query}`)
	}

	return { action: decision.action }
}

// Node to perform a web search
async function searchWebNode(ctx: NodeContext<ResearchContext>): Promise<NodeResult> {
	const query = await ctx.context.get('search_query')
	if (!query)
		return { output: 'No search query provided.' }

	const searchResults = await searchWeb(query)
	const currentContext = (await ctx.context.get('context')) || ''
	const newContext = `${currentContext}\n\nSearch for "${query}":\n${searchResults}`
	await ctx.context.set('context', newContext)

	const count = (await ctx.context.get('search_count')) || 0
	await ctx.context.set('search_count', count + 1)

	console.log(`📚 Found information (Search #${count + 1}), analyzing results...`)
	return { output: newContext }
}

// Node to generate the final answer
async function answerQuestion(ctx: NodeContext): Promise<NodeResult> {
	const question = (await ctx.context.get('question'))!
	const context = (await ctx.context.get('context')) || 'No context provided.'
	const prompt = `Based on the following context, provide a comprehensive answer to the question.
 Context:
 ${context}

 Question: "${question}"`

	console.log('✍️  Crafting final answer...')
	const finalAnswer = await callLLM(prompt)
	await ctx.context.set('answer', finalAnswer)
	console.log('✅ Answer generated successfully.')
	return { output: finalAnswer }
}

export function createAgentFlow() {
	return createFlow<ResearchContext>('research-agent')
		.node('initialize-research', async ({ context }) => {
			const question = await context.get('question')
			if (!question) {
				throw new Error('Initial context must contain a "question".')
			}
			if (!(await context.has('search_count'))) {
				await context.set('search_count', 0)
			}
			if (!(await context.has('context'))) {
				await context.set('context', '')
			}
			console.log(`DEBUG: Research initialized for question: "${question}"`)
			return { output: 'Initialized' }
		})
		.node('decide-action', decideAction, {}, { joinStrategy: 'any' })
		.node('search-web', searchWebNode)
		.node('answer-question', answerQuestion)
		// Define the graph structure
		.edge('initialize-research', 'decide-action')
		.edge('decide-action', 'search-web', { action: 'search' })
		.edge('decide-action', 'answer-question', { action: 'answer' })
		.edge('search-web', 'decide-action')
}
