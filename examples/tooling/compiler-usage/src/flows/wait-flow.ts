import { waitForEvent } from './steps.js'

/** @flow */
export async function waitFlow(_context: any) {
	console.log('Starting wait flow...')
	// @ts-expect-error - Flow functions are compiled, not executed directly
	const eventResult = await waitForEvent({ eventName: 'user:action' })
	console.log('Received event:', eventResult)
	return { waited: true, event: eventResult }
}
