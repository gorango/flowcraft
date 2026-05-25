import { aggregateData, fetchActivity, fetchOrders, fetchProfile } from './steps.js'

/** @flow */
export async function parallelFlow(_context: any) {
	// @ts-expect-error - Flow functions are compiled, not executed directly
	const [profile, orders, activity] = await Promise.all([
		fetchProfile(),
		fetchOrders(),
		fetchActivity(),
	])

	// @ts-expect-error - Flow functions are compiled, not executed directly
	const result = await aggregateData({ profile, orders, activity })
	return result
}
