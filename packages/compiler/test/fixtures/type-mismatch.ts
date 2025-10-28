/** @flow */
export async function typeMismatchFlow(_context: any) {
	// This should trigger a type error - passing string where number is expected
	// @ts-expect-error
	const result = await processNumber({ value: 'not a number' })
	return result
}

/** @step */
export async function processNumber(params: { value: number }) {
	return params.value * 2
}
