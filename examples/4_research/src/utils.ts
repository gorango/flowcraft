import process from 'node:process'
import OpenAI from 'openai'
import { getJson } from 'serpapi'
import 'dotenv/config'

const openaiClient = new OpenAI()

/**
 * Calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
export async function callLLM(prompt: string): Promise<string> {
	try {
		console.log(`\n--- Sending to LLM ---\n${prompt.substring(0, 300)}...\n---------------------\n`)
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: `Today's date is ${new Date().toISOString()}.`,
				},
				{ role: 'user', content: prompt },
			],
			temperature: 0.2,
		})
		const result = response.choices[0].message.content || ''
		console.log(`--- Received from LLM ---\n${result}\n-----------------------\n`)
		return result
	} catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		throw new Error(`OpenAI API call failed: ${error.message}`)
	}
}

/**
 * Calls the SerpApi API to search the web.
 * @param query The search query.
 * @returns The search results as a string.
 */
export async function searchWeb(query: string): Promise<string> {
	const apiKey = process.env.SERP_API_KEY
	if (!apiKey) {
		throw new Error('SERP_API_KEY environment variable is required')
	}

	try {
		const results = await getJson({
			engine: 'google',
			q: query,
			num: 5,
			api_key: apiKey,
		})
		const organicResults = results.organic_results || []
		const formattedResults = organicResults
			.map(
				(result: any, index: number) =>
					`${index + 1}. ${result.title}\n   URL: ${result.link}\n   Snippet: ${result.snippet}`,
			)
			.join('\n\n')
		return formattedResults || 'No results found.'
	} catch (error: any) {
		console.error('Error calling SerpAPI:', error)
		return `Error: Could not fetch search results. ${error.message}`
	}
}
