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

// Helper functions
async function doSomething() {
	return { result: 'something' }
}

async function doSomethingElse() {
	return { result: 'something else' }
}

async function finalize() {
	return { final: true }
}
