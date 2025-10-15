import OpenAI from 'openai'
import SuperJSON from 'superjson'
import 'dotenv/config'

const openaiClient = new OpenAI()

/**
 * Calls the OpenAI Chat Completions API for generation tasks.
 */
export async function callLLM(prompt: string): Promise<string> {
	console.log(`\n--- Sending to LLM for Generation ---\n${prompt}\n`)
	try {
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.1,
		})
		const result = response.choices[0].message.content || ''
		console.log(
			'--- Received from LLM ---',
			'\n====================================================\n',
			result,
			'\n====================================================\n',
		)
		return result
	} catch (error: any) {
		console.error('Error calling OpenAI API for generation:', error)
		throw new Error(`OpenAI API call failed: ${error.message}`)
	}
}

/**
 * Calls the OpenAI Embeddings API.
 */
export async function getEmbedding(text: string): Promise<number[]> {
	console.log(`[Embeddings API] Generating embedding for text: "${text.substring(0, 50)}..."`)
	try {
		const response = await openaiClient.embeddings.create({
			model: 'text-embedding-3-small',
			input: text.replace(/\n/g, ' '),
		})
		return response.data[0].embedding
	} catch (error: any) {
		console.error('Error calling OpenAI Embeddings API:', error)
		throw new Error(`OpenAI Embeddings API call failed: ${error.message}`)
	}
}

/**
 * Simulates cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
	const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
	const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
	const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
	return dotProduct / (magnitudeA * magnitudeB)
}

/**
 * Resolves a template string by replacing {{key}} with values from a data object.
 */
export function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		if (value === undefined || value === null) {
			console.warn(`Template variable '{{${key.trim()}}}' not found in data.`)
			return ''
		}
		// Use superjson to handle complex objects like our SearchResult class
		if (typeof value === 'object') return SuperJSON.stringify(value)

		return String(value)
	})
}
