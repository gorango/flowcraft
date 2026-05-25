/** @step */
export async function riskyOperation(params: { input: any }) {
	return { result: 'success', data: params.input }
}

/** @step */
export async function fallbackAction() {
	return { result: 'fallback' }
}

/** @step */
export async function cleanup() {
	return { cleaned: true }
}

/** @step */
export async function afterAll() {
	return { done: true }
}

/** @flow */
export async function tryFinallyFlow(context: any) {
	const input = await context.get('input')

	try {
		await riskyOperation({ input })
	} finally {
		await cleanup()
	}

	await afterAll()
}

/** @flow */
export async function tryCatchFinallyFlow(context: any) {
	const input = await context.get('input')

	try {
		await riskyOperation({ input })
	} catch {
		await fallbackAction()
	} finally {
		await cleanup()
	}

	await afterAll()
}
