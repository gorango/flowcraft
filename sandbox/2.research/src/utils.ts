import process from 'node:process'
import OpenAI from 'openai'

const openaiClient = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Synchronously calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
export async function callLLM(prompt: string): Promise<string> {
	try {
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
		})
		return response.choices[0].message.content || ''
	}
	catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

/**
 * Placeholder for a synchronous web search function.
 * In a real application, using an async flow and an async search function is highly recommended.
 * @param query The search query.
 * @returns A formatted string of placeholder search results.
 */
export function searchWeb(query: string): string {
	console.log(`[SYNC PLACEHOLDER] Searching for: "${query}"`)
	// In a real implementation, you would use a library that makes an async HTTP request.
	return `
Title: Placeholder Result for ${query}
URL: http://example.com/search?q=${encodeURIComponent(query)}
Snippet: The Nobel Prize in Physics 2024 was awarded jointly to John J. Hopfield and Geoffrey Hinton "for foundational discoveries and inventions that enable machine learning with artificial neural networks."

Title: Second Placeholder
URL: http://example.com/placeholder
Snippet: Using synchronous I/O in Node.js can block the event loop, impacting performance. Async operations are the standard.
`.trim()
}
