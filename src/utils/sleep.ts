import { AbortError } from '../errors'

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
