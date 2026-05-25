import type { NodeContext } from 'flowcraft'

/** @step */
export async function fetchProfile(ctx: NodeContext) {
	const { context } = ctx
	const userId = await context.get('userId')
	console.log(`Fetching profile for user ${userId}`)
	return { output: { name: 'User', id: userId } }
}

/** @step */
export async function fetchOrders(ctx: NodeContext) {
	const { context } = ctx
	const userId = await context.get('userId')
	console.log(`Fetching orders for user ${userId}...`)
	return { output: { orders: [], userId } }
}

/** @step */
export async function fetchActivity(ctx: NodeContext) {
	const { context } = ctx
	const userId = await context.get('userId')
	console.log(`Fetching activity for user ${userId}...`)
	return { output: { activity: [], userId } }
}

/** @step */
export async function aggregateData(ctx: NodeContext) {
	const { input } = ctx

	const profile = input?.fetchProfile_parallel_1
	const orders = input?.fetchOrders_parallel_1
	const activity = input?.fetchActivity_parallel_1

	return { output: { combined: true, profile, orders, activity } }
}

/** @step */
export async function sleep(ctx: NodeContext) {
	const { params } = ctx
	console.log(`Sleeping for ${params.duration}ms...`)
	await new Promise((resolve) => setTimeout(resolve, params.duration))
	console.log('Woke up from sleep')
	return { output: { slept: true } }
}

/** @step */
export async function waitForEvent(ctx: NodeContext) {
	const { params } = ctx
	console.log(`Waiting for event: ${params.eventName}...`)
	await new Promise((resolve) => setTimeout(resolve, 1000))
	console.log(`Event received: ${params.eventName}`)
	return { output: { eventReceived: params.eventName, data: 'simulated event data' } }
}
