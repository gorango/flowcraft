# Concrete Examples

## Example 1: Order processing pipeline

```typescript
interface OrderContext {
	orderId: string
	items: OrderItem[]
	total: number
	payment?: PaymentResult
	fulfillment?: FulfillmentResult
}

const orderFlow = createFlow<OrderContext>('order-processing')
	.node('validate-order', async ({ context }) => {
		const items = context.get('items')
		if (items.length === 0) return { output: null, action: 'invalid' }
		const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
		context.set('total', total)
		return { output: { valid: true, total } }
	})
	.node('process-payment', async ({ context }) => {
		const total = context.get('total')
		const payment = await chargePayment(total)
		context.set('payment', payment)
		return { output: payment, action: payment.success ? 'paid' : 'failed' }
	})
	.node('fulfill', async ({ context }) => {
		const fulfillment = await shipOrder(context.get('orderId'))
		context.set('fulfillment', fulfillment)
		return { output: fulfillment }
	})
	.node('notify-failure', async ({ context }) => ({
		output: await sendFailureNotification(context.get('orderId')),
	}))
	.node('notify-success', async ({ context }) => ({
		output: await sendConfirmationEmail(context.get('orderId')),
	}))
	.edge('validate-order', 'process-payment')
	.edge('validate-order', 'notify-failure', { action: 'invalid' })
	.edge('process-payment', 'fulfill', { action: 'paid' })
	.edge('process-payment', 'notify-failure', { action: 'failed' })
	.edge('fulfill', 'notify-success')
```

## Example 2: Content moderation workflow

```typescript
interface ModerationContext {
	content: string
	userId: string
	flags?: string[]
	decision?: 'approved' | 'rejected' | 'review'
	reviewer?: string
}

const moderationFlow = createFlow<ModerationContext>('content-moderation')
	.node('scan', async ({ context }) => {
		const content = context.get('content')
		const flags = await runAutomatedScan(content)
		context.set('flags', flags)

		if (flags.length === 0) return { output: flags, action: 'clean' }
		if (flags.some((f) => f.severity === 'critical')) return { output: flags, action: 'reject' }
		return { output: flags, action: 'review' }
	})
	.node('auto-approve', async () => ({ output: 'approved' }))
	.node('auto-reject', async () => ({ output: 'rejected' }))
	.wait('human-review')
	.node('apply-decision', async ({ context }) => {
		const decision = context.get('decision')
		return { output: decision }
	})
	.edge('scan', 'auto-approve', { action: 'clean' })
	.edge('scan', 'auto-reject', { action: 'reject' })
	.edge('scan', 'human-review', { action: 'review' })
	.edge('human-review', 'apply-decision')
```

## Example 3: ETL pipeline with error handling

```typescript
interface ETLContext {
	sourceUrl: string
	records?: Record<string, unknown>[]
	transformed?: Record<string, unknown>[]
	loadResult?: { loaded: number; errors: number }
}

const etlFlow = createFlow<ETLContext>('etl-pipeline')
	.node('extract', async ({ context }) => {
		const url = context.get('sourceUrl')
		const records = await fetchAndParse(url)
		context.set('records', records)
		return { output: { count: records.length } }
	})
	.node('transform', async ({ context }) => {
		const records = context.get('records')
		const transformed = records.map((r) => ({
			...r,
			processedAt: new Date().toISOString(),
			id: generateId(),
		}))
		context.set('transformed', transformed)
		return { output: { count: transformed.length } }
	})
	.node('load', async ({ context }) => {
		const data = context.get('transformed')
		const result = await bulkInsert(data)
		context.set('loadResult', result)
		return { output: result }
	})
	.node('retry-load', async ({ context }) => {
		const data = context.get('transformed')
		const result = await bulkInsertWithRetry(data)
		context.set('loadResult', result)
		return { output: result }
	})
	.node('cleanup', async ({ context }) => ({
		output: `Loaded ${context.get('loadResult')?.loaded} records`,
	}))
	.edge('extract', 'transform')
	.edge('transform', 'load', {
		config: {
			maxRetries: 3,
			retryDelay: 5000,
			timeout: 30000,
			fallback: 'retry-load',
		},
	})
	.edge('load', 'cleanup')
	.edge('retry-load', 'cleanup')
```

## Example 4: Parallel image processing

```typescript
interface ImageContext {
	imageUrls: string[]
	results?: ProcessedImage[]
}

const imageFlow = createFlow<ImageContext>('image-processing')
	.node('collect', async ({ context }) => ({
		output: context.get('imageUrls'),
	}))
	.batch(
		'resize',
		async ({ input }) => {
			const resized = await resizeImage(input.url, 800, 600)
			return { output: resized }
		},
		{
			inputKey: 'imageUrls',
			outputKey: 'results',
		},
	)
	.node('generate-thumbnails', async ({ context }) => {
		const results = context.get('results')
		const thumbnails = await Promise.all(results.map((r) => createThumbnail(r.url, 200, 150)))
		return { output: thumbnails }
	})
	.edge('collect', 'resize')
	.edge('resize', 'generate-thumbnails')
```
