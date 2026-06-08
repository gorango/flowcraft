/** @step */
export async function processItem(params: { item: string }) {
	return { processed: params.item }
}

/** @flow */
export default async function (context: any) {
	const item = await context.get('item')
	return await processItem({ item })
}
