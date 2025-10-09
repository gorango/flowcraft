import process from 'node:process'
import OpenAI from 'openai'

const openaiClient = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Extracts a YAML code block from a string, removing markdown fences.
 * @param text The text which may contain a YAML block.
 * @returns The clean YAML string.
 */
function extractYaml(text: string): string {
	// Match a YAML block and capture its content. If no block is found, use the whole string.
	const match = text.match(/```(?:yaml)?\n([\s\S]*?)\n```/)
	return (match ? match[1] : text).trim()
}

/**
 * Asynchronously calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
export async function callLLM(prompt: string): Promise<string> {
	try {
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
		})
		const content = response.choices[0]?.message?.content || ''
		return extractYaml(content)
	}
	catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

/**
 * Placeholder for an asynchronous web search function.
 * @param query The search query.
 * @returns A formatted string of placeholder search results.
 */
export async function searchWeb(query: string): Promise<string> {
	console.log(`[ASYNC PLACEHOLDER] Searching for: "${query}"`)
	return Promise.resolve(`
Title: Placeholder Result for ${query}
URL: http://example.com/search?q=${encodeURIComponent(query)}
Snippet: The Nobel Prize in Physics 2024 was awarded jointly to John J. Hopfield and Geoffrey Hinton "for foundational discoveries and inventions that enable machine learning with artificial neural networks."

Title: Second Placeholder
URL: http://example.com/placeholder
Snippet: Using synchronous I/O in Node.js can block the event loop, impacting performance. Async operations are the standard.
`.trim())
}
