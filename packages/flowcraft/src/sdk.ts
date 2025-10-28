export interface Webhook<T = any> {
	/** The unique public URL to which the external system should send its POST request. */
	url: string
	/** A unique event name which can be used to trigger the webhook */
	event: string
	/** A promise-like object that resolves with the webhook's request details when it is invoked. */
	request: Promise<{
		json: () => Promise<T>
		text: () => Promise<string>
		headers: Record<string, string>
	}>
}

/**
 * Pauses workflow execution for a specified duration.
 * Must be used with `await` inside a compiled `@flow` function.
 */
export function sleep(_duration: number | string): Promise<void> {
	console.warn(`'sleep' should only be used inside a compiled @flow function.`)
	return new Promise(() => { }) // intentionally never resolves
}

/**
 * Pauses a workflow until an external event is received.
 * Must be used with `await` inside a compiled `@flow` function.
 */
export function waitForEvent<T = any>(_eventName: string): Promise<T> {
	console.warn(`'waitForEvent' should only be used inside a compiled @flow function.`)
	return new Promise(() => { }) // intentionally never resolves
}

/**
 * Creates a durable, single-use webhook endpoint.
 * Must be used with `await` inside a compiled `@flow` function.
 */
export function createWebhook<T = any>(): Promise<Webhook<T>> {
	console.warn(`'createWebhook' should only be used inside a compiled @flow function.`)
	return new Promise(() => { }) // intentionally never resolves
}
