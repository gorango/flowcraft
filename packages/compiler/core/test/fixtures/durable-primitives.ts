import { createWebhook, sleep, waitForEvent } from 'flowcraft/sdk'

/** @flow */
export async function durablePrimitivesFlow(_context: any) {
	// Test sleep
	await sleep('5m')

	// Test waitForEvent
	const eventData = await waitForEvent<{ message: string }>('test_event')

	// Test createWebhook
	const webhook = await createWebhook<{ data: string }>()

	// Send webhook URL to external service (simulated)
	console.log('Webhook URL:', webhook.url)

	// Wait for webhook to be called
	const request = await webhook.request
	const webhookData = await request.json()

	return {
		eventMessage: eventData.message,
		webhookData: webhookData.data,
	}
}
