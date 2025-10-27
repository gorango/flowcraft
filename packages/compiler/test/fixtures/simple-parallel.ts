/** @flow */
export async function simpleParallelFlow(context: any) {
	const userId = await context.get('userId')

	// Simple parallel execution
	const [profile, orders] = await Promise.all([fetchProfile({ userId }), fetchOrders({ userId })])

	// Gather node that uses the results
	const result = await aggregateData({ profile, orders })
	return result
}

// Helper functions
async function fetchProfile(params: { userId: any }) {
	return { name: 'User', id: params.userId }
}

async function fetchOrders(params: { userId: any }) {
	return { orders: [], userId: params.userId }
}

async function aggregateData(params: { profile: any; orders: any }) {
	return { combined: true, ...params }
}
