export function nodeId(n: unknown): string {
	return (n as Record<string, unknown>).id as string
}

export function edgeSource(e: unknown): string {
	return (e as Record<string, unknown>).source as string
}

export function edgeTarget(e: unknown): string {
	return (e as Record<string, unknown>).target as string
}
