/** @step */
export async function fetchUser(params: { id: number }) {
	return { name: 'Alice', id: params.id }
}

/** @step */
export async function fetchConfig(_params: { key: string }) {
	return { value: 'dark_mode' }
}

/** @step */
export async function mergeResults(params: { results: any[] }) {
	return { merged: true, count: params.results.length }
}

/** @flow */
export async function allSettledFlow(_context: any) {
	const [userResult, configResult] = await Promise.allSettled([
		fetchUser({ id: 1 }),
		fetchConfig({ key: 'theme' }),
	])

	const results = [userResult, configResult]
	return await mergeResults({ results })
}

/** @flow */
export async function raceFlow(_context: any) {
	const winner = await Promise.race([fetchUser({ id: 42 }), fetchConfig({ key: 'timeout' })])

	return winner
}
