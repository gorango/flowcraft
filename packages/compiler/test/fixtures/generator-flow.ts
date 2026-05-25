/** @flow */
export async function* generatorFlow(context: any) {
	yield await context.get('item')
}
