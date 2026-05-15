# Common Patterns

## Sequential pipeline

Chain nodes with edges for linear data processing:

```typescript
const flow = createFlow<{ raw: Data; cleaned: Data; result: Result }>('pipeline')
	.node('fetch', async () => ({ output: await fetchData() }))
	.node('clean', async ({ input }) => ({ output: cleanData(input.output) }))
	.node('analyze', async ({ input }) => ({ output: analyze(input.output) }))
	.node('store', async ({ context, input }) => {
		context.set('result', input.output)
		return { output: input.output }
	})
	.edge('fetch', 'clean')
	.edge('clean', 'analyze')
	.edge('analyze', 'store')
```

## Conditional branching

Use `action` returns and conditional edges:

```typescript
const flow = createFlow<{ score: number }>('review')
	.node('evaluate', async ({ context }) => {
		const score = context.get('score')
		if (score >= 80) return { output: { score }, action: 'pass' }
		if (score >= 60) return { output: { score }, action: 'review' }
		return { output: { score }, action: 'fail' }
	})
	.node('approve', async ({ input }) => ({ output: 'approved' }))
	.node('manual-review', async ({ input }) => ({ output: 'reviewed' }))
	.node('reject', async ({ input }) => ({ output: 'rejected' }))
	.edge('evaluate', 'approve', { action: 'pass' })
	.edge('evaluate', 'manual-review', { action: 'review' })
	.edge('evaluate', 'reject', { action: 'fail' })
```

## Error handling and retries

```typescript
const flow = createFlow('resilient')
	.node('api-call', async () => ({ output: await callExternalAPI() }), {
		config: {
			maxRetries: 3,
			retryDelay: 2000,
			timeout: 10000,
		},
	})
	.node('fallback', async () => ({ output: getCachedData() }))
	.edge('api-call', 'fallback', { action: 'fallback' })

// Class-based with explicit fallback
class ResilientNode extends BaseNode {
	async exec(ctx) {
		return { output: await callExternalAPI() }
	}
	async fallback(ctx, error) {
		return { output: getCachedData(), action: 'fallback' }
	}
}
```

## Data flow patterns

### Passing data through edges

```typescript
const flow = createFlow('data-flow')
	.node('produce', async () => ({ output: { items: [1, 2, 3], meta: 'data' } }))
	.node('consume', async ({ input }) => {
		// input = { items: [1, 2, 3], meta: 'data' }
		return { output: input.items.length }
	})
	.edge('produce', 'consume')
```

### Using edge transforms

```typescript
const flow = createFlow('transform')
	.node('produce', async () => ({ output: { data: { items: [1, 2, 3] } } }))
	.node('consume', async ({ input }) => {
		// input = [1, 2, 3] (transformed)
		return { output: input }
	})
	.edge('produce', 'consume', { transform: 'input.data.items' })
```

### Sharing state via context

```typescript
const flow = createFlow<{ shared: string }>('context-share')
	.node('writer', async ({ context }) => {
		context.set('shared', 'hello from writer')
		return { output: 'done' }
	})
	.node('reader', async ({ context }) => {
		const value = context.get('shared') // 'hello from writer'
		return { output: value }
	})
	.edge('writer', 'reader')
```

## Fan-out/fan-in

Multiple successors from one node, converging at a join:

```typescript
const flow = createFlow('fan')
	.node('start', async () => ({ output: 'data' }))
	.node('branch-a', async ({ input }) => ({ output: `A: ${input.output}` }))
	.node('branch-b', async ({ input }) => ({ output: `B: ${input.output}` }))
	.node(
		'join',
		async ({ context }) => {
			const a = context.get('_outputs.branch-a')
			const b = context.get('_outputs.branch-b')
			return { output: { a, b } }
		},
		{ config: { joinStrategy: 'all' } },
	)
	.edge('start', 'branch-a')
	.edge('start', 'branch-b')
	.edge('branch-a', 'join')
	.edge('branch-b', 'join')
```

## Cancellation support

Check abort signals in long-running nodes:

```typescript
const flow = createFlow('cancellable').node('long-task', async ({ signal }) => {
	for (let i = 0; i < 100; i++) {
		signal?.throwIfAborted()
		await processChunk(i)
	}
	return { output: 'done' }
})

// Cancel from outside
const controller = new AbortController()
const runtime = new FlowRuntime()
runtime.run(blueprint, {}, { signal: controller.signal })

// Later...
controller.abort()
```
