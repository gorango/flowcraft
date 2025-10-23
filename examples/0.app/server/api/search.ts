import { getJson } from 'serpapi'

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig(event)
	const { query } = await readBody(event)
	if (!query) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Query is required',
		})
	}
	try {
		const results = await getJson({
			engine: 'google',
			q: query,
			num: 5,
			api_key: config.serpApiKey,
		})
		const organicResults = results.organic_results || []
		const formattedResults = organicResults
			.map(
				(result: any, index: number) =>
					`${index + 1}. ${result.title}\n   URL: ${result.link}\n   Snippet: ${result.snippet}`,
			)
			.join('\n\n')
		return { results: formattedResults || 'No results found.' }
	}
	catch (error: any) {
		console.error('Error calling SerpAPI:', error)
		throw createError({
			statusCode: 500,
			statusMessage: `Error: Could not fetch search results. ${error.message}`,
		})
	}
})
