import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api'
import type { ContextImplementation, Middleware, NodeResult } from 'flowcraft'
import { extractContext } from './propagator'

export class OpenTelemetryMiddleware implements Middleware {
	private readonly tracer: Tracer

	constructor(tracerName: string, tracerVersion?: string) {
		this.tracer = trace.getTracer(tracerName, tracerVersion)
	}

	async aroundNode(
		ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		// 1. Extract parent context propagated from the predecessor node
		const parentContext = await extractContext(ctx, nodeId)

		const span = this.tracer.startSpan(`execute-node:${nodeId}`, undefined, parentContext)

		// Set standard attributes for all node spans
		span.setAttributes({
			'flowcraft.run.id': await ctx.get('runId' as any),
			'flowcraft.blueprint.id': await ctx.get('blueprintId' as any),
			'flowcraft.node.id': nodeId,
		})

		try {
			// 2. Execute the actual node logic within the span's context
			const result = await context.with(trace.setSpan(context.active(), span), next)

			span.setStatus({ code: SpanStatusCode.OK })

			// Note: downstreamNodes propagation would require runtime integration

			return result
		} catch (error: any) {
			span.recordException(error)
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error.message,
			})
			throw error
		} finally {
			span.end()
		}
	}
}
