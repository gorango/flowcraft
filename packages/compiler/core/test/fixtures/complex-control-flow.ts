/** @flow */
export async function complexControlFlow(context: any) {
	const data = await context.get('data')

	// Initial validation
	const validated = await validateData({ data })

	if (!validated.isValid) {
		await handleValidationError({ error: 'Validation failed' })
		return { success: false }
	}

	// Process in batches with retry logic
	let processedCount = 0
	let currentBatch = await context.get('batch')

	while (currentBatch && currentBatch.length > 0) {
		try {
			const results = await processBatch({ batch: currentBatch })
			processedCount += results.processed

			// Update context for next iteration
			await context.set('processedCount', processedCount)
			currentBatch = await context.get('nextBatch')
		} catch (error) {
			await handleBatchError({ error, batch: currentBatch })
			// Continue with next batch
			currentBatch = await context.get('nextBatch')
		}
	}

	// Parallel finalization
	const [summary, report] = await Promise.all([
		generateSummary({ processedCount }),
		generateReport({ data, processedCount }),
	])

	// Conditional notification
	if (processedCount > 1000) {
		await sendHighVolumeNotification({ summary, report })
	} else {
		await sendStandardNotification({ summary })
	}

	return { success: true, summary, report }
}

/** @flow */
export async function nestedControlFlow(context: any) {
	const items = await context.get('items')

	for (const item of items) {
		const processed = await processItem({ item })

		if (processed.needsReview) {
			const reviewed = await reviewItem({ item: processed })

			if (reviewed.approved) {
				await approveItem({ item: reviewed })
			} else {
				await rejectItem({ item: reviewed })
			}
		} else if (processed.canAutoApprove) {
			await autoApproveItem({ item: processed })
		} else {
			await flagItemForManualReview({ item: processed })
		}
	}

	return await finalizeProcessing({ items })
}

/** @step */
export async function validateData(params: { data: any }) {
	return { isValid: true, data: params.data }
}

/** @step */
export async function handleValidationError(params: { error: any }) {
	return { handled: true, error: params.error }
}

/** @step */
export async function processBatch(params: { batch: any[] }) {
	return { processed: params.batch.length }
}

/** @step */
export async function handleBatchError(params: { error: any; batch: any[] }) {
	return { errorHandled: true, batch: params.batch }
}

/** @step */
export async function generateSummary(params: { processedCount: number }) {
	return { total: params.processedCount, summary: 'complete' }
}

/** @step */
export async function generateReport(params: { data: any; processedCount: number }) {
	return { report: 'generated', ...params }
}

/** @step */
export async function sendHighVolumeNotification(params: { summary: any; report: any }) {
	return { notification: 'high_volume_sent', ...params }
}

/** @step */
export async function sendStandardNotification(params: { summary: any }) {
	return { notification: 'standard_sent', ...params }
}

/** @step */
export async function processItem(params: { item: any }) {
	return { ...params.item, processed: true, needsReview: Math.random() > 0.5 }
}

/** @step */
export async function reviewItem(params: { item: any }) {
	return { ...params.item, reviewed: true, approved: Math.random() > 0.3 }
}

/** @step */
export async function approveItem(params: { item: any }) {
	return { ...params.item, approved: true }
}

/** @step */
export async function rejectItem(params: { item: any }) {
	return { ...params.item, rejected: true }
}

/** @step */
export async function autoApproveItem(params: { item: any }) {
	return { ...params.item, autoApproved: true }
}

/** @step */
export async function flagItemForManualReview(params: { item: any }) {
	return { ...params.item, flagged: true }
}

/** @step */
export async function finalizeProcessing(params: { items: any[] }) {
	return { completed: true, itemCount: params.items.length }
}
