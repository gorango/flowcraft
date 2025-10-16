import { context, propagation, type Span, type TextMapGetter, type TextMapSetter, trace } from '@opentelemetry/api'
import type { ContextImplementation } from 'flowcraft'

const TRACE_CONTEXT_KEY_PREFIX = '_traceContext_'

// Setter to inject context into a simple object
const setter: TextMapSetter<Record<string, string>> = {
	set(carrier: Record<string, string>, key: string, value: string) {
		carrier[key] = value
	},
}

// Getter to extract context from a simple object
const getter: TextMapGetter<Record<string, string>> = {
	get(carrier: Record<string, string>, key: string) {
		return carrier[key]
	},
	keys(carrier: Record<string, string>) {
		return Object.keys(carrier)
	},
}

/** Injects the current span's context into the shared state for a target node. */
export async function injectContext(
	flowContext: ContextImplementation<Record<string, any>>,
	span: Span,
	downstreamNodeIds: string[],
): Promise<void> {
	const activeContext = trace.setSpan(context.active(), span)
	const carrier = {}
	propagation.inject(activeContext, carrier, setter)

	for (const nodeId of downstreamNodeIds) {
		if (flowContext.type === 'async') {
			await flowContext.set(`${TRACE_CONTEXT_KEY_PREFIX}${nodeId}` as any, carrier)
		} else {
			flowContext.set(`${TRACE_CONTEXT_KEY_PREFIX}${nodeId}` as any, carrier)
		}
	}
}

/** Extracts a parent trace context from the shared state for the current node. */
export async function extractContext(
	flowContext: ContextImplementation<Record<string, any>>,
	nodeId: string,
): Promise<import('@opentelemetry/api').Context> {
	const contextKey = `${TRACE_CONTEXT_KEY_PREFIX}${nodeId}` as any
	const carrier = (await flowContext.get(contextKey)) || {}
	if (flowContext.type === 'async') {
		await flowContext.delete(contextKey) // Clean up after reading for async context
	} else {
		flowContext.delete(contextKey) // Sync context
	}

	return propagation.extract(context.active(), carrier, getter)
}
