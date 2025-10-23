import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig(event)
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
	})

	const { prompt, systemMessage, type, input } = await readBody(event)
	if (!prompt && !input) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Prompt or input is required',
		})
	}
	try {
		if (type === 'embedding') {
			const response = await client.embeddings.create({
				model: 'text-embedding-3-small',
				input: input,
			})
			return { response: response.data[0].embedding }
		} else {
			const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'user' as const, content: prompt }]
			if (systemMessage) {
				messages.unshift({ role: 'system' as const, content: systemMessage })
			}
			const response = await client.chat.completions.create({
				model: 'gpt-4o-mini',
				messages,
				temperature: 0.2,
			})
			return { response: response.choices[0]?.message?.content || '' }
		}
	}
	catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		throw createError({
			statusCode: 500,
			statusMessage: `Error: Could not get a response from the LLM. Details: ${error.message}`,
		})
	}
})