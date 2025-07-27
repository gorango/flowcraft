# Observability (Tracing & Metrics)

For production-grade applications, understanding how your workflows are performing is critical. Observability—through structured logging, distributed tracing, and metrics—allows you to debug issues, identify bottlenecks, and monitor the health of your system.

Flowcraft's `Middleware` pattern is the perfect place to integrate observability tooling like **OpenTelemetry** without cluttering your business logic. This guide will show you how to create a middleware that adds tracing and metrics to every node in your flow.

## The Goal

We want to create a middleware that, for every node execution:

1. **Starts a new OpenTelemetry Span**: This creates a "trace" that visualizes the node as a distinct unit of work, showing its duration and relationship to other nodes.
2. **Adds Attributes**: Enriches the span with useful information like the node's name, the action it returned, and whether it succeeded or failed.
3. **Records Metrics**: Captures the duration of the node's execution as a histogram metric, allowing you to create dashboards and alerts for performance.
4. **Propagates Context**: Ensures that any operations performed *inside* the node (like an API call) are part of the same trace.

## Prerequisites

This guide assumes you have a basic OpenTelemetry setup for Node.js. If you don't, please refer to the official [OpenTelemetry for Node.js Getting Started guide](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/).

At a minimum, you'll need the following packages:

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node
```

And a simple file (`tracing.ts`) to configure the SDK:

```typescript
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http' // or your preferred exporter
// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node'

const sdk = new NodeSDK({
	traceExporter: new OTLPTraceExporter(),
	instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()
```

## The Observability Middleware

Here is a complete, reusable middleware for OpenTelemetry. You can place this in a file like `src/middleware/tracing.ts`.

```typescript
import {
	context,
	Meter,
	metrics,
	Span,
	SpanStatusCode,
	trace,
	Tracer,
} from '@opentelemetry/api'
// src/middleware/tracing.ts
import { Middleware, NodeArgs } from 'flowcraft'

export class ObservabilityMiddleware {
	private tracer: Tracer
	private meter: Meter
	private nodeDurationHistogram: any // In real OTel, this is an Instrument

	constructor() {
		// Get the global tracer and meter from your OTel setup
		this.tracer = trace.getTracer('flowcraft-workflow-tracer')
		this.meter = metrics.getMeter('flowcraft-workflow-meter')

		// Create a metric to record node execution time
		this.nodeDurationHistogram = this.meter.createHistogram('flowcraft.node.duration', {
			description: 'Duration of Flowcraft node execution',
			unit: 'ms',
		})
	}

	// The middleware function itself
	public readonly middleware: Middleware = async (args: NodeArgs, next) => {
		const { name: nodeName } = args

		// Start a new span for this node execution
		return this.tracer.startActiveSpan(`run ${nodeName}`, async (span: Span) => {
			const startTime = Date.now()

			span.setAttribute('flowcraft.node.name', nodeName)

			try {
				// Run the actual node logic
				const action = await next(args)

				const duration = Date.now() - startTime

				// Record the duration as a metric
				this.nodeDurationHistogram.record(duration, { 'flowcraft.node.name': nodeName, 'flowcraft.node.status': 'success' })

				// Add the action to the span and set status to OK
				span.setAttribute('flowcraft.node.action', String(action))
				span.setStatus({ code: SpanStatusCode.OK })

				return action
			}
			catch (error: any) {
				const duration = Date.now() - startTime

				// Record the failed duration
				this.nodeDurationHistogram.record(duration, { 'flowcraft.node.name': nodeName, 'flowcraft.node.status': 'error' })

				// Mark the span as failed and record the error details
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.message,
				})
				span.recordException(error)

				// Re-throw the error to ensure the workflow's error handling takes over
				throw error
			}
			finally {
				// End the span, ensuring it's always closed
				span.end()
			}
		})
	}
}
```

## How to Use It

Using the middleware is straightforward. Instantiate it and apply it to your `Flow` with `.use()`.

```typescript
import { Flow, Node, TypedContext } from 'flowcraft'

import { ObservabilityMiddleware } from './middleware/tracing'
// main.ts
import './tracing' // Important: Initialize OpenTelemetry SDK first!

class GreetNode extends Node {
	async exec() {
		console.log('Hello from GreetNode!')
		// In a real app, an instrumented library like `fetch` would create a child span automatically here.
	}
}

class FarewellNode extends Node {
	async exec() {
		console.log('Goodbye from FarewellNode!')
	}
}

// 1. Create an instance of our middleware
const obsMiddleware = new ObservabilityMiddleware()

// 2. Create the flow
const greetNode = new GreetNode()
greetNode.next(new FarewellNode())
const flow = new Flow(greetNode)

// 3. Apply the middleware to the flow
flow.use(obsMiddleware.middleware)

// 4. Run it
await flow.run(new TypedContext())
```

## What Happens Now?

When you run this code with a configured OpenTelemetry exporter (e.g., sending to Jaeger, Zipkin, or a service like Honeycomb or Datadog), you will get:

- **A Trace Waterfall**: You'll see a visual breakdown of your workflow. The `run GreetNode` span will be followed by the `run FarewellNode` span. You can immediately see how long each took and in what order they executed.
- **Rich Context**: Clicking on a span will show all the attributes we added: the node's name, the action it returned, and any errors that occurred.
- **Performance Metrics**: You can now build dashboards and alerts based on the `flowcraft.node.duration` metric. For example, you can graph the P95 duration for a specific node or alert if its failure rate (`flowcraft.node.status: 'error'`) spikes.

This simple but powerful pattern makes your Flowcraft workflows fully observable, turning them from black boxes into transparent, debuggable, and production-ready systems.
