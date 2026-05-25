/** @step */
export async function validateInput(params: { input: any }) {
	return { valid: params.input != null }
}

/** @step */
export async function processFull(params: { input: any }) {
	return { processed: params.input }
}

/** @step */
export async function handleNull() {
	return { skipped: true }
}

/** @flow */
export async function returnEarlyFlow(context: any) {
	const input = await context.get('input')

	const validation = await validateInput({ input })

	if (!validation.valid) {
		await handleNull()
		return
	}

	await processFull({ input })
}
