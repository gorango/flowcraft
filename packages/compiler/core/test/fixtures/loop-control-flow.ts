/** @flow */
export async function whileLoopWithBreak(_context: any) {
	let count = 0

	while (count < 10) {
		const result = await processItem({ count })
		count++

		if (result.shouldBreak) {
			break
		}
	}

	return await finalize({ count })
}

/** @flow */
export async function whileLoopWithContinue(_context: any) {
	let count = 0

	while (count < 10) {
		const result = await processItem({ count })

		if (result.shouldSkip) {
			count++
			continue
		}

		await handleItem({ result })
		count++
	}

	return await finalize({ count })
}

/** @flow */
export async function forOfLoopWithBreak(context: any) {
	const items = await context.get('items')
	let processedCount = 0

	for (const item of items) {
		const result = await processItem({ item })

		if (result.shouldBreak) {
			break
		}

		processedCount++
	}

	return await finalize({ processedCount })
}

/** @flow */
export async function forOfLoopWithContinue(context: any) {
	const items = await context.get('items')
	let processedCount = 0

	for (const item of items) {
		const result = await processItem({ item })

		if (result.shouldSkip) {
			continue
		}

		await handleItem({ result })
		processedCount++
	}

	return await finalize({ processedCount })
}

/** @step */
export async function processItem(params: { count?: number; item?: any }) {
	return {
		shouldBreak: Math.random() > 0.8,
		shouldSkip: Math.random() > 0.7,
		...params,
	}
}

/** @step */
export async function handleItem(params: { result: any }) {
	return { handled: true, ...params }
}

/** @step */
export async function finalize(params: { count?: number; processedCount?: number }) {
	return { completed: true, ...params }
}
