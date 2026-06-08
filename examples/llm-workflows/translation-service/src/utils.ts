import process from 'node:process'
import OpenAI from 'openai'

const client = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Asynchronously calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
export async function callLLM(prompt: string): Promise<string> {
	try {
		const response = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
		})
		return response.choices[0].message.content || ''
	} catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}
