import type { ISerializer } from './types'

/**
 * A default serializer using standard JSON.
 *
 * @warning This implementation is lossy and does not handle complex data types
 * like `Date`, `Map`, `Set`, `undefined`, etc. It is recommended to provide a robust
 * serializer like `superjson` if working with complex data types.
 */
export class JsonSerializer implements ISerializer {
	private hasWarned = false

	serialize(data: Record<string, any>): string {
		for (const value of Object.values(data)) {
			if (value instanceof Map || value instanceof Set || value instanceof Date) {
				if (!this.hasWarned) {
					console.warn(
						'[Flowcraft] Warning: Default JsonSerializer does not support Map, Set, or Date types. Data may be lost. Consider providing a custom ISerializer (e.g., using superjson).',
					)
					this.hasWarned = true
				}
			}
		}
		try {
			return JSON.stringify(data)
		} catch {
			console.warn('[Flowcraft] Warning: Circular reference detected in context. Using safe serialization.')
			return JSON.stringify({ _circularReference: true, message: 'Context contains circular references' })
		}
	}

	deserialize(text: string): Record<string, any> {
		return JSON.parse(text)
	}
}
