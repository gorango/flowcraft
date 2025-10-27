/** @flow */
export async function simpleFlow(_context: any) {
	await fetchUser({ id: 1 })
	await processOrders({ orders: [] })
}

export async function fetchUser({ id }: { id: number }) {
	return { id, name: 'John' }
}

export async function processOrders({ orders }: { orders: any[] }) {
	console.log(orders)
}
