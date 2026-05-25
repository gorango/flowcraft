/** @step */
export async function validate(params: { value: any }) {
	if (params.value == null) {
		throw new Error('invalid')
	}
	return { valid: true }
}

/** @step */
export async function processValue(params: { value: any }) {
	return { processed: params.value }
}

/** @step */
export async function skipProcessing() {
	return { skipped: true }
}

/** @flow */
export async function throwFlow(context: any) {
	const value = await context.get('value')

	try {
		await validate({ value })
		await processValue({ value })
	} catch {
		await skipProcessing()
	}
}
