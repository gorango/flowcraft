export async function fetchUser({ id }: { id: number }) {
	return { id, name: 'John' }
}

export async function fetchOrders({ userId }: { userId: number }) {
	return [{ id: 1, userId }]
}

export async function processOrders({ orders }: { orders: any[] }) {
	console.log(orders)
}
