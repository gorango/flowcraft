import type { Logger } from '../logger'
import type { Middleware, MiddlewareNext, NodeArgs } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { contextKey, TypedContext } from '../context'
import { Flow, Node } from '../workflow'

function getActionDisplay(action: any): string {
	if (typeof action === 'symbol')
		return action.description ?? 'symbol'

	return String(action)
}

const traversalLoggingMiddleware: Middleware = async (args: NodeArgs, next: MiddlewareNext) => {
	const { logger, node } = args

	const action = await next(args)

	if (node) {
		const nextNode = node.successors.get(action)?.[0]
		const actionDisplay = getActionDisplay(action)

		if (nextNode) {
			logger.debug(
				`[Traversal] Action '${actionDisplay}' from '${node.constructor.name}' leads to '${nextNode.constructor.name}'`,
				{ action },
			)
		}
		else if (action !== undefined && action !== null) {
			logger.debug(
				`[Traversal] Flow ends: Action '${actionDisplay}' from '${node.constructor.name}' has no configured successor.`,
			)
		}
	}
	return action
}

function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

const VALUE = contextKey<number>('value')
class StartNode extends Node {
	async exec({ ctx }: NodeArgs) { ctx.set(VALUE, 15) }
}
class DecisionNode extends Node<void, void, 'over' | 'under'> {
	async post({ ctx }: NodeArgs) { return ctx.get(VALUE)! > 10 ? 'over' : 'under' }
}
class OverPathNode extends Node { }
class UnderPathNode extends Node { }
class FinalNode extends Node<void, void, 'finished'> {
	async post() { return 'finished' as const }
}

describe('traversalLoggingMiddleware', () => {
	it('should log the path taken through a branching workflow', async () => {
		const mockLogger = createMockLogger()
		const ctx = new TypedContext()
		const start = new StartNode()
		const decision = new DecisionNode()
		const over = new OverPathNode()
		const under = new UnderPathNode()
		start.next(decision)
		decision.next(over, 'over')
		decision.next(under, 'under')
		const flow = new Flow(start)
		flow.use(traversalLoggingMiddleware)

		await flow.run(ctx, { logger: mockLogger })

		expect(mockLogger.debug).toHaveBeenCalledWith(
			expect.stringContaining('[Traversal] Action \'default\' from \'StartNode\' leads to \'DecisionNode\''),
			expect.any(Object),
		)
		expect(mockLogger.debug).toHaveBeenCalledWith(
			expect.stringContaining('[Traversal] Action \'over\' from \'DecisionNode\' leads to \'OverPathNode\''),
			expect.any(Object),
		)
		expect(mockLogger.debug).not.toHaveBeenCalledWith(
			expect.stringContaining('leads to \'UnderPathNode\''),
			expect.any(Object),
		)
	})

	it('should log when a flow branch terminates', async () => {
		const mockLogger = createMockLogger()
		const ctx = new TypedContext()
		const start = new StartNode()
		const decision = new DecisionNode()
		const final = new FinalNode()
		start.next(decision)
		decision.next(final, 'over')
		const flow = new Flow(start)
		flow.use(traversalLoggingMiddleware)

		await flow.run(ctx, { logger: mockLogger })

		expect(mockLogger.debug).toHaveBeenCalledWith(
			expect.stringContaining('[Traversal] Flow ends: Action \'finished\' from \'FinalNode\' has no configured successor.'),
		)
	})
})
