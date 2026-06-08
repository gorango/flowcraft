/** @step */
export async function processItem(params: { index: number }) {
	return { processed: params.index }
}

/** @step */
export async function shouldContinue(params: { count: number }) {
	return { done: params.count >= 3 }
}

/** @flow */
export async function doWhileFlow(_context: any) {
	let count = 0

	do {
		await processItem({ index: count })
		count++
	} while (count < 3)
}
