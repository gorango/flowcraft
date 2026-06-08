/** @step */
export async function stepA() {
	return { result: 'A' }
}

/** @step */
export async function stepB() {
	return { result: 'B' }
}

/** @flow */
export async function throwInFlow(context: any) {
	await stepA()

	if (await context.get('fail')) {
		throw new Error('planned failure')
	}

	await stepB()
}
