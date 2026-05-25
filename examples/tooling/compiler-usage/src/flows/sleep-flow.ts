import { sleep } from './steps.js'

/** @flow */
export async function sleepFlow(_context: any) {
	console.log('Starting sleep flow...')
	// @ts-expect-error - Flow functions are compiled, not executed directly
	await sleep({ duration: 1000 })
	console.log('Woke up from sleep')
	return { slept: true }
}
