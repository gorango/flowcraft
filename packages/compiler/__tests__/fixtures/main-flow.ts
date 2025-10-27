/** @flow */
async function mainFlow(context: any) {
	const user = await fetchUser({ id: 1 })
	const orders = await fetchOrders({ userId: user.id })
	await processOrders({ orders })
}
