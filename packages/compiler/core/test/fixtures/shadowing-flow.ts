/** @step */
export async function stepA() {
	return { value: 1 }
}

/** @step */
export async function stepB() {
	return { value: 2 }
}

/** @step */
export async function processValue(params: { val: number }) {
	return params.val
}

/** @flow */
export async function shadowingFlow(context: any) {
	const result = await stepA()

	if (await context.get('condition')) {
		// eslint-disable-next-line no-shadow
		const result = await stepB()
		await processValue({ val: result.value })
	}

	await processValue({ val: result.value })
}
