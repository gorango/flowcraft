/** @step */
export const processItem = async function () {
	return { processed: true }
}

/** @flow */
export async function mainFlow() {
	await processItem()
}
