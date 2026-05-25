import { parallelFlow } from './parallel-flow.js'

/** @flow */
export async function subflowExample(context: any) {
	console.log('Starting subflow example...')
	const subResult = await parallelFlow(context)
	console.log('Subflow completed:', subResult)
	return { subflowDone: true, ...subResult }
}
