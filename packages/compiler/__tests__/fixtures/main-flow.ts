import { fetchUser, processOrders } from './steps'
import { subFlow } from './sub-flow'

/** @flow */
export async function mainFlow(_context: any) {
	await fetchUser({ id: 1 })
	await subFlow()
	await processOrders({ orders: [] })
}
