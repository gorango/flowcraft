import type { ISerializer } from './types'

/**
 * A default serializer using standard JSON.
 * WARNING: This implementation is lossy and does not handle complex data types
 * like `Date`, `Map`, `Set`, `undefined`, etc. It is recommended to provide a robust
 * serializer like `superjson` if working with complex data types.
 */
export class JsonSerializer implements ISerializer {
	serialize(data: Record<string, any>): string {
		return JSON.stringify(data)
	}

	deserialize(text: string): Record<string, any> {
		return JSON.parse(text)
	}
}
