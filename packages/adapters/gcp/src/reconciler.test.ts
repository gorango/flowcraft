import { describe, expect, it, vi } from 'vitest'
import { createGcpReconciler } from './reconciler'

function createMockFirestore(items: Record<string, any> = {}) {
	const docs: Record<string, any> = {}
	for (const [id, data] of Object.entries(items)) {
		docs[id] = {
			id,
			data: () => data,
		}
	}
	const thresholdFilter = { _threshold: null }
	return {
		collection: vi.fn().mockReturnValue({
			where: vi.fn().mockImplementation((field, _op, _value) => {
				if (field === 'status') {
					return {
						where: vi.fn().mockImplementation((field2, _op2, threshold) => {
							if (threshold) {
								thresholdFilter._threshold = threshold
							}
							return {
								get: vi.fn().mockImplementation(async () => {
									const filteredDocs = Object.values(docs).filter((doc: any) => {
										const lastUpdated = doc.data().lastUpdated as any
										const thresholdTime = thresholdFilter._threshold as any
										const lastTime = lastUpdated?.getTime?.() || 0
										const threshTime = thresholdTime?.getTime?.() || 0
										return lastTime && lastTime < threshTime
									})
									return {
										empty: filteredDocs.length === 0,
										docs: filteredDocs,
									}
								}),
							}
						}),
					}
				}
				return {
					where: vi.fn().mockReturnValue({
						get: vi.fn().mockImplementation(async () => ({
							empty: Object.keys(items).length === 0,
							docs: Object.values(docs),
						})),
					}),
				}
			}),
		}),
	}
}

function createMockAdapter() {
	return {
		reconcile: vi.fn().mockResolvedValue(new Set(['node-1'])),
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		},
	}
}

describe('createGcpReconciler', function () {
	it('should create reconciler', function () {
		const firestore = createMockFirestore({})
		const adapter = createMockAdapter()
		const reconciler = createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const firestore = createMockFirestore({})
		const adapter = createMockAdapter()
		const reconciler = createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const oldDate = new Date(Date.now() - 400 * 1000)
		const firestore = createMockFirestore({
			'run-1': { status: 'running', lastUpdated: oldDate },
			'run-2': { status: 'running', lastUpdated: oldDate },
		})
		const adapter = createMockAdapter()
		const reconciler = createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle empty query result', async function () {
		const firestore = createMockFirestore({})
		const adapter = createMockAdapter()
		const reconciler = createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const oldDate = new Date(Date.now() - 400 * 1000)
		const firestore = createMockFirestore({
			'run-1': { status: 'running', lastUpdated: oldDate },
		})
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should use custom logger', async function () {
		const firestore = createMockFirestore({})
		const adapter = createMockAdapter()
		const customLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}
		createGcpReconciler({
			adapter: adapter as any,
			firestoreClient: firestore as any,
			statusCollectionName: 'status',
			stalledThresholdSeconds: 300,
			logger: customLogger,
		})
	})
})
