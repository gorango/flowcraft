/**
 * A registry defining the dynamic context keys set by each built-in node.
 * This object is the single source of truth.
 */
export const BUILTIN_KEYS = {
	'batch-scatter': ['currentIndex', 'hasMore'],
	'batch-gather': ['allWorkerIds', 'hasMore'],
	// 'loop-controller': ['loopCounter']
} as const

/**
 * A comprehensive map of all possible dynamic keys to their corresponding TypeScript types.
 * The compiler will enforce that any key used in `BUILTIN_KEYS` must have an entry here.
 */
type DynamicKeyTypeMap = {
	currentIndex: number
	hasMore: boolean
	allWorkerIds: string[]
	// loopCounter: number
}

/**
 * A utility type that creates a union of all possible dynamic key strings
 * by flattening the values of the `BUILTIN_KEYS` object.
 *
 * Example: 'currentIndex' | 'hasMore' | 'allWorkerIds'
 */
type AllDynamicKeyStrings = (typeof BUILTIN_KEYS)[keyof typeof BUILTIN_KEYS][number]

/**
 * The final, dynamically generated `DynamicKeys` type.
 *
 * It uses a mapped type to construct an object where:
 * - The keys are the union of all strings from `AllDynamicKeyStrings`.
 * - The value for each key is looked up from our central `DynamicKeyTypeMap`.
 *
 * This ensures that `DynamicKeys` is always perfectly in sync with `BUILTIN_KEYS`.
 */
export type DynamicKeys = {
	[K in AllDynamicKeyStrings]: DynamicKeyTypeMap[K]
}
