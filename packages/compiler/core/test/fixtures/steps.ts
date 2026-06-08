/** @step */
export async function fetchUser({ id }: { id: number }) {
	return { id, name: 'John' }
}

/** @step */
export async function fetchOrders({ userId }: { userId: number }) {
	return [{ id: 1, userId }]
}

/** @step */
export async function processOrders({ orders }: { orders: any[] }) {
	console.log(orders)
}

/** @step */
export async function recordTransaction({ data }: { data: string }) {
	console.log('Recording transaction:', data)
}
