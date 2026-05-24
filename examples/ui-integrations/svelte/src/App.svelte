<script lang="ts">
	import { Position } from '@xyflow/svelte'
	import { createFlow } from 'flowcraft'
	import Flow from './lib/Flow.svelte'
	import type { HandlePositions } from './lib/Flow.svelte'

	const LAG = 800

	const expenseFlow = createFlow('expense-report-pipeline')
		.node('fetch-report', async ({ context }) => {
			await new Promise((r) => setTimeout(r, LAG))
			await context.set('reportId', 'EXP-001')
			await context.set('employee', 'Alice')
			return {
				output: [
					{ amount: 45, type: 'meals', receipt: 'receipt-1.jpg' },
					{ amount: 120, type: 'travel', receipt: 'receipt-2.jpg' },
					{ amount: 1500, type: 'equipment', receipt: 'receipt-3.jpg' },
				],
			}
		})
		.batch(
			'validate-items',
			async ({ input }) => {
				await new Promise((r) => setTimeout(r, LAG))
				const item = input as any
				const ocrConfidence = item.amount > 1000 ? 0.7 : 0.95
				return { output: { ...item, ocrConfidence, status: 'validated' } }
			},
			{ inputKey: 'fetch-report', outputKey: 'validated' },
		)
		.node(
			'compute-total',
			async ({ input, context }) => {
				await new Promise((r) => setTimeout(r, LAG))
				const total = input.reduce((sum: number, item: any) => sum + item.amount, 0)
				const minConfidence = Math.min(...input.map((i: any) => i.ocrConfidence))
				await context.set('total', total)
				await context.set('minConfidence', minConfidence)
				await context.set('ocrAttempts', 0)
				return { output: { total, minConfidence } }
			},
			{ inputs: 'validated' },
		)
		.edge('fetch-report', 'validate-items')
		.edge('validate-items', 'compute-total')
		.node('enhance-ocr', async ({ context }) => {
			await new Promise((r) => setTimeout(r, LAG))
			const attempts = ((await context.get('ocrAttempts')) as number) || 0
			const currentMin = ((await context.get('minConfidence')) as number) || 0
			const newAttempts = attempts + 1
			const improved = Math.min(0.95, currentMin + 0.1 * newAttempts)
			await context.set('minConfidence', improved)
			await context.set('ocrAttempts', newAttempts)
			return { output: { minConfidence: improved, ocrAttempts: newAttempts } }
		})
		.loop('ocrRetry', {
			startNodeId: 'enhance-ocr',
			endNodeId: 'enhance-ocr',
			condition: 'minConfidence < 0.9 && ocrAttempts < 3',
		})
		.edge('compute-total', 'ocrRetry')
		.edge('ocrRetry', 'route-by-total')
		.node('route-by-total', async ({ context }) => {
			await new Promise((r) => setTimeout(r, LAG))
			const total = ((await context.get('total')) as number) || 0
			return { output: { total } }
		})
		.edge('route-by-total', 'wait-manager', {
			condition: 'route-by-total.total >= 500 && route-by-total.total <= 2000',
		})
		.edge('route-by-total', 'auto-approve', { condition: 'route-by-total.total < 500' })
		.edge('route-by-total', 'auto-reject', { condition: 'route-by-total.total > 2000' })
		.wait('wait-manager')
		.node('auto-approve', async () => ({ output: { status: 'approved', method: 'auto' } }))
		.node('auto-reject', async () => ({
			output: { status: 'rejected', reason: 'Exceeds single-report limit' },
		}))
		.node(
			'send-notification',
			async ({ input }) => {
				await new Promise((r) => setTimeout(r, LAG))
				return { output: { message: `Notification sent: ${(input as any).status}` } }
			},
			{ config: { joinStrategy: 'any' } },
		)
		.edge('wait-manager', 'send-notification')
		.edge('auto-approve', 'send-notification')
		.edge('auto-reject', 'send-notification')

	const positionsMap = {
		'fetch-report': { x: 0, y: 150 },
		'validate-items': { x: 0, y: 300 },
		'compute-total': { x: 0, y: 450 },
		'enhance-ocr': { x: 150, y: 650 },
		'route-by-total': { x: 430, y: 500 },
		'wait-manager': { x: 700, y: 300 },
		'auto-approve': { x: 700, y: 430 },
		'auto-reject': { x: 700, y: 540 },
		'send-notification': { x: 1000, y: 430 },
	}

	const typesMap: Record<string, 'input' | 'default' | 'output'> = {
		'fetch-report': 'input',
		'validate-items': 'default',
		'compute-total': 'default',
		'enhance-ocr': 'default',
		'route-by-total': 'default',
		'wait-manager': 'default',
		'auto-approve': 'default',
		'auto-reject': 'default',
		'send-notification': 'output',
	}

	const handlesMap: Record<string, HandlePositions> = {
		'fetch-report': { source: Position.Bottom },
		'validate-items': { target: Position.Top, source: Position.Bottom },
		'compute-total': { target: Position.Top, source: Position.Bottom },
		'enhance-ocr': { target: Position.Top, source: Position.Right },
	}
</script>

<main class="layout">
	<div class="header">
		<h1 class="title">Expense Report Pipeline</h1>
		<p class="description">
			Demonstrates batches, loops, conditionals, and HITL — powered by
			<a href="https://flowcraft.dev" target="_blank" rel="noopener noreferrer" class="link">
				flowcraft</a>
		</p>
	</div>
	<div class="flow-wrapper">
		<Flow {expenseFlow} {positionsMap} {typesMap} {handlesMap} />
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
	}

	.layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: hsl(var(--background));
		padding: 1rem;
		gap: 1rem;
		box-sizing: border-box;
	}

	.header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.title {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.description {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.link {
		text-decoration: underline;
		text-underline-offset: 2px;
		color: hsl(var(--muted-foreground));
		transition: color 0.15s;
	}

	.link:hover {
		color: hsl(var(--foreground));
	}

	.flow-wrapper {
		flex: 1;
		min-height: 0;
	}
</style>
