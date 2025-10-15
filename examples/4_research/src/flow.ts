import type { NodeContext, NodeResult } from 'flowcraft'
import { createFlow } from 'flowcraft'
import { callLLM, searchWeb } from './utils.js'

// --- Context Interface ---
interface ResearchAgentContext {
	question: string
	search_context: string
	loop_count: number
	current_query?: string
	last_action?: string
	answer?: string
}

// --- Node Logic ---

// Decide node: The "brain" of the agent
async function decide(ctx: NodeContext<ResearchAgentContext>): Promise<NodeResult> {
	const { question, search_context, loop_count } = await ctx.context.toJSON()
	const prompt = `Based on the question and context, decide whether to 'search' or 'answer'. Respond in JSON format with 'action' (search or answer) and 'reason'. If action is 'search', include 'search_query'.

Question: ${question}
Context: ${search_context}
Searches count: ${loop_count}

JSON Response:`
	const response = await callLLM(prompt)
	const decision = JSON.parse(
		response
			.replace(/^```json\n/, '')
			.replace(/\n```$/, '')
			.trim(),
	)

	// Pass the search query to the next step via the context
	await ctx.context.set('current_query', decision.search_query)

	// Set last_action for loop condition
	await ctx.context.set('last_action', decision.action)

	// Use an 'action' to control the workflow's path
	return { action: decision.action, output: decision }
}

// Search node: The "tool" of the agent
async function search(ctx: NodeContext<ResearchAgentContext>): Promise<NodeResult> {
	const query = await ctx.context.get('current_query')
	if (!query) {
		throw new Error('current_query is required for search')
	}
	const results = await searchWeb(query)
	const current_context = (await ctx.context.get('search_context')) || ''
	await ctx.context.set('search_context', `${current_context}\n${results}`)

	// Increment loop_count after each search
	const currentLoopCount = (await ctx.context.get('loop_count')) || 0
	await ctx.context.set('loop_count', currentLoopCount + 1)

	return { output: results }
}

// Answer node: The final output step
async function answer(ctx: NodeContext<ResearchAgentContext>): Promise<NodeResult> {
	const { question, search_context } = await ctx.context.toJSON()
	const prompt = `Answer the question based on the context. Q: ${question}, C: ${search_context}`
	const finalAnswer = await callLLM(prompt)
	await ctx.context.set('answer', finalAnswer)
	return { output: finalAnswer }
}

// --- The Workflow Definition ---

export function createAgentFlow() {
	const flow = createFlow<ResearchAgentContext>('research-agent')

	flow
		.node('initialize', async ({ context }) => {
			// Set up the initial state for the loop
			await context.set('search_context', '')
			await context.set('loop_count', 0)
			await context.set('last_action', undefined) // Initialize last_action
			return { output: 'Initialized' }
		})
		.node('decide', decide, { config: { joinStrategy: 'any' } }) // 'any' allows re-execution
		.node('search', search)
		.node('answer', answer)

		// The main loop
		.loop('research', {
			startNodeId: 'decide',
			endNodeId: 'search', // The loop body includes 'decide' and 'search'
			condition: "loop_count < 2 && last_action !== 'answer'", // Exit condition
		})
		// If the loop breaks, go to the answer node
		.edge('research-loop', 'answer', { action: 'break' })
		// NOTE: loop controllers get '-loop' appended to their IDs
		// Either use a string reference like above or more explicitly:
		// .edge(flow.getLoopControllerId('research'), 'answer', { action: 'break' })

		// Edges
		.edge('initialize', 'decide')
		.edge('decide', 'search', { action: 'search' }) // Conditional path
		.edge('decide', 'answer', { action: 'answer' }) // Conditional path
		.edge('search', 'decide') // Loop back after searching

	return flow
}
