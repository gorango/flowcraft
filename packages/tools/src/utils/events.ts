function asRecord(e: unknown): Record<string, unknown> {
	if (e && typeof e === 'object') return e as Record<string, unknown>
	return {}
}

export function getEventProp<T>(e: unknown, key: string): T | undefined {
	const record = asRecord(e)
	let value = record[key] as T | undefined
	if (value !== undefined) return value
	const payload = record.payload as Record<string, unknown> | undefined
	if (payload && key in payload) {
		console.warn(
			`[getEventProp] Key '${key}' exists in payload but not at top level — this may return unexpected values`,
		)
		value = payload[key] as T | undefined
	}
	return value
}

export function getCompletedNodes(events: unknown[]): string[] {
	const nodeIds = new Set<string>()
	for (const event of events) {
		if (getEventProp<string>(event, 'type') === 'node:finish') {
			const nodeId = getEventProp<string>(event, 'nodeId')
			if (nodeId) nodeIds.add(nodeId)
		}
	}
	return Array.from(nodeIds)
}

export function getNodeErrors(
	events: unknown[],
): Array<{ nodeId: string; message: string; isFatal?: boolean }> {
	const errors: Array<{ nodeId: string; message: string; isFatal?: boolean }> = []
	for (const event of events) {
		if (getEventProp<string>(event, 'type') !== 'node:error') continue
		const nodeId = getEventProp<string>(event, 'nodeId')
		if (!nodeId) continue
		const error = getEventProp<Record<string, unknown>>(event, 'error')
		const errorMessage = error?.message
		errors.push({
			nodeId,
			message: errorMessage ? String(errorMessage) : 'Unknown error',
			isFatal: error?.isFatal as boolean | undefined,
		})
	}
	return errors
}

export function reconstructContext(events: unknown[]): Record<string, unknown> {
	const context: Record<string, unknown> = {}
	for (const event of events) {
		if (getEventProp<string>(event, 'type') !== 'context:change') continue
		const key = getEventProp<string>(event, 'key')
		const value = getEventProp<unknown>(event, 'value')
		const op = getEventProp<string>(event, 'op')
		if (!key) continue
		if (op === 'delete') {
			delete context[key]
		} else {
			context[key] = value
		}
	}
	return context
}

export function getExecutionStatus(events: unknown[]): { status: string; blueprintId?: string } {
	if (events.length === 0) return { status: 'unknown' }

	const startEvent = events.find((e) => getEventProp<string>(e, 'type') === 'workflow:start')
	const finishEvent = events.find((e) => getEventProp<string>(e, 'type') === 'workflow:finish')
	const stallEvent = events.find((e) => getEventProp<string>(e, 'type') === 'workflow:stall')
	const pauseEvent = events.find((e) => getEventProp<string>(e, 'type') === 'workflow:pause')

	let status = 'started'
	if (finishEvent) {
		status = getEventProp<string>(finishEvent, 'status') ?? 'completed'
	} else if (stallEvent) {
		status = 'failed'
	} else if (pauseEvent) {
		status = 'awaiting'
	}

	return {
		status,
		blueprintId: getEventProp<string>(startEvent ?? finishEvent, 'blueprintId'),
	}
}

export function getAwaitingNodesInfo(
	events: unknown[],
): Array<{ nodeId: string; details: Record<string, unknown> }> {
	const result: Array<{ nodeId: string; details: Record<string, unknown> }> = []
	const context = reconstructContext(events)

	const awaitingNodeIds = context._awaitingNodeIds
	if (Array.isArray(awaitingNodeIds)) {
		const awaitingDetails = (context._awaitingDetails ?? {}) as Record<string, unknown>
		for (const nodeId of awaitingNodeIds) {
			result.push({
				nodeId: String(nodeId),
				details: (awaitingDetails[String(nodeId)] as Record<string, unknown>) ?? {},
			})
		}
	}
	return result
}

export function getNodeFinishEvent(
	events: unknown[],
	nodeId: string,
): Record<string, unknown> | undefined {
	return events.find((e) => {
		if (getEventProp<string>(e, 'type') !== 'node:finish') return false
		return getEventProp<string>(e, 'nodeId') === nodeId
	}) as Record<string, unknown> | undefined
}

export function getNodeErrorEvents(events: unknown[], nodeId: string): Record<string, unknown>[] {
	return events.filter((e) => {
		if (getEventProp<string>(e, 'type') !== 'node:error') return false
		return getEventProp<string>(e, 'nodeId') === nodeId
	}) as Record<string, unknown>[]
}

export function getNodeRetryHistory(events: unknown[], nodeId: string): Array<{ attempt: number }> {
	const retries: Array<{ attempt: number }> = []
	for (const event of events) {
		if (getEventProp<string>(event, 'type') !== 'node:retry') continue
		if (getEventProp<string>(event, 'nodeId') !== nodeId) continue
		const attempt = getEventProp<number>(event, 'attempt')
		retries.push({ attempt: attempt ?? 0 })
	}
	return retries
}
