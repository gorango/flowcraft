import { recordTransaction } from './steps'

/** @flow */
export async function subFlow(_context: any) {
	await recordTransaction({ data: 'subflow transaction' })
}
