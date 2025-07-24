import { AbortError } from '../errors'

/**
 * An abortable `sleep` utility that pauses execution for a specified duration.
 * It will reject with an `AbortError` if the provided `AbortSignal` is triggered.
 * @param ms The number of milliseconds to sleep.
 * @param signal An optional `AbortSignal` to listen for cancellation.
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted)
			return reject(new AbortError())

		const timeoutId = setTimeout(resolve, ms)
		signal?.addEventListener('abort', () => {
			clearTimeout(timeoutId)
			reject(new AbortError())
		})
	})
}
