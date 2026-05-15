# Durable Primitives

Flowcraft provides built-in node types for distributed scenarios that persist across worker restarts.

## SleepNode

Durable timers that survive process restarts:

```typescript
const flow = createFlow('delayed-task')
	.node('start', async () => ({ output: 'started' }))
	.sleep('wait-5min', { duration: 300000 })
	.node('continue', async () => ({ output: 'resumed after 5min' }))
	.edge('start', 'wait-5min')
	.edge('wait-5min', 'continue')
```

**Configuration:**

- `duration`: milliseconds to wait

**Scheduler setup:**

```typescript
// Start the scheduler to auto-resume sleep nodes
runtime.startScheduler(10000) // check every 10 seconds

// Stop when done
runtime.stopScheduler()
```

The scheduler polls for completed sleep nodes and resumes the workflow automatically.

## WaitNode

Human-in-the-loop pauses for external input:

```typescript
const flow = createFlow<{ approved?: boolean; comment?: string }>('approval')
	.node('submit', async ({ context }) => ({
		output: { request: context.get('request') },
	}))
	.wait('approval')
	.node('process', async ({ context }) => {
		const approved = context.get('approved')
		return { output: approved ? 'approved' : 'rejected' }
	})
	.edge('submit', 'approval')
	.edge('approval', 'process')
```

**Resume workflow:**

```typescript
// Run until wait node
const result = await runtime.run(flow.toBlueprint(), { request: 'Deploy' })
// result.status === 'awaiting'

// Serialize context for storage
const serialized = result.context.toJSON()

// Later, resume with user input
await runtime.resume(flow.toBlueprint(), serialized, {
	approved: true,
	comment: 'Looks good to go',
})
```

**Awaiting details:**

```typescript
result.context._awaitingNodeIds // ['approval']
result.context._awaitingDetails // Additional metadata about the wait
```

## WebhookNode

Create durable webhook endpoints that trigger workflow nodes:

```typescript
const flow = createFlow('webhook-handler')
	.node('webhook', {
		uses: 'webhook',
		params: {
			path: '/hooks/stripe',
			secret: process.env.STRIPE_WEBHOOK_SECRET,
		},
	})
	.node('process-event', async ({ input }) => {
		const event = input.body
		return { output: await handleEvent(event) }
	})
	.edge('webhook', 'process-event')
```

**Configuration:**

- `path`: URL path for the webhook endpoint
- `secret`: Optional secret for signature verification

## SubflowNode

Execute nested workflows within a parent:

```typescript
// Child workflow
const emailFlow = createFlow<{ to: string; subject: string; body: string }>('send-email')
	.node('validate', async ({ context }) => ({ output: 'valid' }))
	.node('send', async ({ context }) => ({
		output: await sendEmail({
			to: context.get('to'),
			subject: context.get('subject'),
			body: context.get('body'),
		}),
	}))
	.edge('validate', 'send')

// Parent workflow
const orderFlow = createFlow<{ email: string; orderId: string }>('order-complete')
	.node('process-order', async () => ({ output: 'processed' }))
	.node('send-confirmation', {
		uses: 'subflow',
		params: { blueprintId: 'send-email' },
		inputs: {
			to: 'context.email',
			subject: 'Order Confirmation',
			body: 'context.orderId',
		},
	})
	.edge('process-order', 'send-confirmation')

// Register child blueprint
const runtime = new FlowRuntime({
	blueprints: [emailFlow.toBlueprint()],
})
```

**Subflow state:**

```typescript
// Access subflow execution state
result.context._subflowState['send-confirmation']
```

## Combining primitives

```typescript
const flow = createFlow('complex-workflow')
	.node('start', async () => ({ output: 'ready' }))
	.sleep('delay', { duration: 60000 })
	.wait('approval')
	.node('process', async ({ context }) => ({ output: 'processing' }))
	.node('subtask', {
		uses: 'subflow',
		params: { blueprintId: 'child-task' },
	})
	.node('webhook', {
		uses: 'webhook',
		params: { path: '/hooks/complete' },
	})
	.edge('start', 'delay')
	.edge('delay', 'approval')
	.edge('approval', 'process')
	.edge('process', 'subtask')
	.edge('subtask', 'webhook')
```
