import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig(event)
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
	})

	const { prompt } = await readBody(event)
	if (!prompt) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Prompt is required',
		})
	}
	try {
		const response = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
		})
		return { translation: response.choices[0].message.content || '' }
	}
	catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		throw createError({
			statusCode: 500,
			statusMessage: `Error: Could not get a response from the LLM. Details: ${error.message}`,
		})
	}
})

