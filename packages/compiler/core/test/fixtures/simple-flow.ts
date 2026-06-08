/** @flow */
export async function simpleFlow(_context: any) {
	await fetchUser({ id: 1 })
	await processOrders({ orders: [] })
}

/** @step */
export async function fetchUser({ id }: { id: number }) {
	return { id, name: 'John' }
}

/** @step */
export async function processOrders({ orders }: { orders: any[] }) {
	console.log(orders)
}
