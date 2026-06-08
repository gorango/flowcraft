/** @flow */
export async function parallelFlow(context: any) {
	const userId = await context.get('userId')

	// Parallel execution using Promise.all
	const [profile, orders, activity] = await Promise.all([
		fetchProfile({ userId }),
		fetchOrders({ userId }),
		fetchActivity({ userId }),
	])

	// Sequential processing after parallel execution
	const result = await aggregateData({ profile, orders, activity })
	return result
}

/** @flow */
export async function complexParallelFlow(context: any) {
	const items = await context.get('items')

	// Parallel processing with different node types
	const [processed, validated, enriched] = await Promise.all([
		processItems({ items }),
		validateItems({ items }),
		enrichItems({ items }),
	])

	// Conditional processing based on parallel results
	if (validated.valid) {
		await saveValidItems({ items: processed })
	} else {
		await handleInvalidItems({ errors: validated.errors })
	}

	// Final aggregation
	return await finalizeResults({ processed, validated, enriched })
}

/** @step */
export async function fetchProfile(params: { userId: any }) {
	return { name: 'User', id: params.userId }
}

/** @step */
export async function fetchOrders(params: { userId: any }) {
	return { orders: [], userId: params.userId }
}

/** @step */
export async function fetchActivity(params: { userId: any }) {
	return { activity: [], userId: params.userId }
}

/** @step */
export async function aggregateData(params: { profile: any; orders: any; activity: any }) {
	return { combined: true, ...params }
}

/** @step */
export async function processItems(params: { items: any[] }) {
	return params.items.map((item) => ({ ...item, processed: true }))
}

/** @step */
export async function validateItems(_params: { items: any[] }) {
	return { valid: true, errors: [] }
}

/** @step */
export async function enrichItems(params: { items: any[] }) {
	return params.items.map((item) => ({ ...item, enriched: true }))
}

/** @step */
export async function saveValidItems(params: { items: any[] }) {
	return { saved: params.items.length }
}

/** @step */
export async function handleInvalidItems(params: { errors: any[] }) {
	return { handled: params.errors.length }
}

/** @step */
export async function finalizeResults(params: any) {
	return { final: true, ...params }
}
