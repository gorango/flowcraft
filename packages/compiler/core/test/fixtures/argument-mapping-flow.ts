/** @step */
export async function createUser(params: { name: string }) {
	return { userId: 123, name: params.name }
}

/** @step */
export async function createCart() {
	return { cartId: 456, items: [] }
}

/** @step */
export async function sendEmail(params: { userId: number }) {
	return { sent: true, userId: params.userId }
}

/** @step */
export async function finalizeOrder(params: { cartId: number }) {
	return { ordered: true, cartId: params.cartId }
}

/** @flow */
export async function argumentMappingFlow(_context: any) {
	const cart = await createCart()
	const user = await createUser({ name: 'Alice' })

	await sendEmail({ userId: user.userId })
	await finalizeOrder({ cartId: cart.cartId })
}
