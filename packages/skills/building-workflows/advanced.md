# Advanced Features

## Loops

Iterate over nodes until a condition is met:

```typescript
const flow = createFlow<{ count: number; total: number }>('counter')
	.node('init', async ({ context }) => {
		context.set('count', 0)
		context.set('total', 0)
		return { output: 'start' }
	})
	.node('increment', async ({ context }) => {
		const count = context.get('count') + 1
		const total = context.get('total') + count
		context.set('count', count)
		context.set('total', total)
		return { output: { count, total } }
	})
	.node('done', async ({ context, input }) => ({
		output: { finalTotal: context.get('total') },
	}))
	.edge('init', 'increment')
	.loop('count-loop', {
		startNodeId: 'increment',
		endNodeId: 'increment',
		condition: 'context.count < 10',
		continueAction: 'continue',
		breakAction: 'break',
	})
	.edge('increment', 'done', { action: 'break' })
```

**Loop configuration:**

- `startNodeId`: First node in the loop body
- `endNodeId`: Last node in the loop body
- `condition`: Expression evaluated each iteration
- `continueAction`: Action to continue looping (default: `'continue'`)
- `breakAction`: Action to exit loop (default: `'break'`)

## Batches (scatter/gather)

Process arrays in parallel:

```typescript
const flow = createFlow<{ items: string[]; results: string[] }>('batch')
	.node('fetch', async () => ({
		output: { items: ['a', 'b', 'c', 'd'] },
	}))
	.batch(
		'process-items',
		async ({ input }) => ({
			output: `processed-${input}`,
		}),
		{
			inputKey: 'items',
			outputKey: 'results',
		},
	)
	.node('aggregate', async ({ context }) => ({
		output: context.get('results'),
	}))
	.edge('fetch', 'process-items')
	.edge('process-items', 'aggregate')
```

**Batch configuration:**

- `inputKey`: Context key containing the array to scatter
- `outputKey`: Context key where gathered results are stored
- Each item is processed in parallel by the worker function
- Results are collected into an array at `outputKey`

## Subflows

Execute nested workflows:

```typescript
// Child workflow
const childFlow = createFlow<{ itemId: string }>('process-item')
	.node('validate', async ({ context }) => ({ output: 'valid' }))
	.node('process', async ({ input }) => ({ output: 'processed' }))
	.edge('validate', 'process')

// Parent workflow
const parentFlow = createFlow<{ items: string[] }>('parent')
	.node('start', async () => ({ output: 'ready' }))
	.node('sub', {
		uses: 'subflow',
		params: { blueprintId: 'process-item' },
		inputs: { itemId: 'start' },
	})
	.node('finish', async ({ input }) => ({ output: 'done' }))
	.edge('start', 'sub')
	.edge('sub', 'finish')

const runtime = new FlowRuntime({
	blueprints: [childFlow.toBlueprint()],
})
```

## Human-in-the-Loop (HITL)

Pause workflow for external input:

```typescript
const flow = createFlow<{ request: string; approved?: boolean }>('approval')
	.node('submit', async ({ context }) => ({
		output: context.get('request'),
	}))
	.wait('approval')
	.node('process', async ({ context, input }) => {
		const approved = context.get('approved')
		if (approved) return { output: 'processed' }
		return { output: 'rejected', action: 'denied' }
	})
	.node('notify-rejected', async () => ({ output: 'notified' }))
	.edge('submit', 'approval')
	.edge('approval', 'process')
	.edge('process', 'notify-rejected', { action: 'denied' })

// Run workflow
const runtime = new FlowRuntime()
const result = await flow.run(runtime, { request: 'Deploy to prod' })
// result.status === 'awaiting'

// Later, resume with approval data
const serialized = result.context.toJSON()
await runtime.resume(flow.toBlueprint(), serialized, {
	approved: true,
	reviewer: 'admin',
	comment: 'Looks good',
})
```

## Sleep (durable timers)

```typescript
const flow = createFlow('reminder')
	.node('send', async () => ({ output: 'sent' }))
	.sleep('wait-5min', { duration: 300000 })
	.node('follow-up', async () => ({ output: 'follow-up sent' }))
	.edge('send', 'wait-5min')
	.edge('wait-5min', 'follow-up')

// Start scheduler to auto-resume sleep nodes
runtime.startScheduler(10000) // check every 10s
```

## Webhook triggers

Create durable webhook endpoints:

```typescript
const flow = createFlow('webhook-flow')
	.node('webhook', {
		uses: 'webhook',
		params: {
			path: '/hooks/payment',
			secret: process.env.WEBHOOK_SECRET,
		},
	})
	.node('process-payment', async ({ input }) => ({
		output: await processPayment(input.body),
	}))
	.edge('webhook', 'process-payment')
```
