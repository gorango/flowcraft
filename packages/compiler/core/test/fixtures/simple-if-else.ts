/** @flow */
export async function simpleIfElseFlow(context: any) {
	const condition = await context.get('condition')

	if (condition) {
		await doSomething()
	} else {
		await doSomethingElse()
	}

	await finalize()
}

/** @step */
export async function doSomething() {
	return { result: 'something' }
}

/** @step */
export async function doSomethingElse() {
	return { result: 'something else' }
}

/** @step */
export async function finalize() {
	return { final: true }
}
