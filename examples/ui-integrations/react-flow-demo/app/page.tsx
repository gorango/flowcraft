'use client'

import { Position } from '@xyflow/react'
import { createFlow } from 'flowcraft'
import { FlowDemo, type HandlePositions } from '@/components/flow/FlowDemo'

const LAG = 800

/**
 * Expense Report Processing Pipeline
 *
 * A real-world workflow that showcases all of flowcraft's advanced primitives:
 *
 *  - Batch   → validate each line item in parallel
 *  - Loop    → retry OCR enhancement until confidence ≥ 0.9 (max 3 attempts)
 *  - Conditional → route by total: auto-approve / HITL / auto-reject
 *  - HITL    → pause and wait for a manager decision
 *  - Converge → join all branches before sending a notification
 */
const expenseFlow = createFlow('expense-report-pipeline')
	// 1. Fetch expense report line items (array output → batch input)
	.node('fetch-report', async ({ context }) => {
		await new Promise((r) => setTimeout(r, LAG))
		await context.set('reportId', 'EXP-001')
		await context.set('employee', 'Alice')
		return {
			output: [
				{ amount: 45, type: 'meals', receipt: 'receipt-1.jpg' },
				{ amount: 120, type: 'travel', receipt: 'receipt-2.jpg' },
				{ amount: 1500, type: 'equipment', receipt: 'receipt-3.jpg' }
			]
		}
	})
	// 2. Batch: validate each line item in parallel
	.batch(
		'validate-items',
		async ({ input }) => {
			await new Promise((r) => setTimeout(r, LAG))
			const item = input as any
			const ocrConfidence = item.amount > 1000 ? 0.7 : 0.95
			return { output: { ...item, ocrConfidence, status: 'validated' } }
		},
		{ inputKey: 'fetch-report', outputKey: 'validated' }
	)
	// 3. Aggregate totals from validated items
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
		{ inputs: 'validated' }
	)
	.edge('fetch-report', 'validate-items')
	.edge('validate-items', 'compute-total')
	// 4. Loop: re-scan receipts if OCR confidence is below threshold
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
		condition: 'minConfidence < 0.9 && ocrAttempts < 3'
	})
	.edge('compute-total', 'ocrRetry')
	.edge('ocrRetry', 'route-by-total')
	// 5. Conditional routing based on total amount
	.node('route-by-total', async ({ context }) => {
		await new Promise((r) => setTimeout(r, LAG))
		const total = ((await context.get('total')) as number) || 0
		return { output: { total } }
	})
	.edge('route-by-total', 'wait-manager', {
		condition: 'route-by-total.total >= 500 && route-by-total.total <= 2000'
	})
	.edge('route-by-total', 'auto-approve', { condition: 'route-by-total.total < 500' })
	.edge('route-by-total', 'auto-reject', { condition: 'route-by-total.total > 2000' })
	// 5a. HITL: pause for manager approval ($500–$2000)
	.wait('wait-manager')
	// 5b. Auto-approve (under $500)
	.node('auto-approve', async () => ({ output: { status: 'approved', method: 'auto' } }))
	// 5c. Auto-reject (over $2000)
	.node('auto-reject', async () => ({
		output: { status: 'rejected', reason: 'Exceeds single-report limit' }
	}))
	// 6. Converge all paths and notify
	.node(
		'send-notification',
		async ({ input }) => {
			await new Promise((r) => setTimeout(r, LAG))
			return { output: { message: `Notification sent: ${(input as any).status}` } }
		},
		{ config: { joinStrategy: 'any' } }
	)
	.edge('wait-manager', 'send-notification')
	.edge('auto-approve', 'send-notification')
	.edge('auto-reject', 'send-notification')

const positionsMap = {
	'fetch-report':      { x: 0,    y: 150 },
	'validate-items':    { x: 0,    y: 300 },
	'compute-total':     { x: 0,    y: 450 },
	'enhance-ocr':       { x: 150,  y: 650 },
	'route-by-total':    { x: 430,  y: 500 },
	'wait-manager':      { x: 700,  y: 300 },
	'auto-approve':      { x: 700,  y: 430 },
	'auto-reject':       { x: 700,  y: 540 },
	'send-notification': { x: 1000, y: 430 }
}

const typesMap: Record<string, 'input' | 'default' | 'output'> = {
	'fetch-report':      'input',
	'validate-items':    'default',
	'compute-total':     'default',
	'enhance-ocr':       'default',
	'route-by-total':    'default',
	'wait-manager':      'default',
	'auto-approve':      'default',
	'auto-reject':       'default',
	'send-notification': 'output'
}

// The first three nodes are stacked vertically, so they use Top/Bottom handles.
// The rest of the graph flows left-to-right (default Right/Left handles).
const handlesMap: Record<string, HandlePositions> = {
	'fetch-report':   { source: Position.Bottom },
	'validate-items': { target: Position.Top, source: Position.Bottom },
	'compute-total':  { target: Position.Top, source: Position.Bottom },
	'enhance-ocr':    { target: Position.Top, source: Position.Right }
}

export default function Home() {
	return (
		<main className="flex flex-col h-screen bg-background p-4 gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="text-lg font-semibold text-foreground">Expense Report Pipeline</h1>
				<p className="text-sm text-muted-foreground">
					Demonstrates batches, loops, conditionals, and HITL — powered by{' '}
					<a
						href="https://flowcraft.dev"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 hover:text-foreground transition-colors"
					>
						flowcraft
					</a>
				</p>
			</div>
			<div className="flex-1 min-h-0">
				<FlowDemo
					flow={expenseFlow}
					positionsMap={positionsMap}
					typesMap={typesMap}
					handlesMap={handlesMap}
				/>
			</div>
		</main>
	)
}
