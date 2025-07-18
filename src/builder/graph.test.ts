import type { Logger, NodeArgs, RunOptions } from '../workflow'
import type { NodeConstructorOptions, TypedWorkflowGraph } from './graph'
import { describe, expect, it, vi } from 'vitest'
import {
	contextKey,
	Node,
	TypedContext,
} from '../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'

function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

const mockLogger = createMockLogger()
const runOptions: RunOptions = { logger: mockLogger }

describe('graphBuilder', () => {
	const VALUE = contextKey<number>('value')

	interface TestNodeTypeMap {
		set: { value: number }
		add: { value: number }
		branch: { threshold: number }
	}

	// A test node that accepts options from the builder
	class SetValueNode extends Node {
		private value: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['set']>) {
			super()
			this.value = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			ctx.set(VALUE, this.value)
		}
	}

	class AddValueNode extends Node {
		private valueToAdd: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['add']>) {
			super()
			this.valueToAdd = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			ctx.set(VALUE, current + this.valueToAdd)
		}
	}

	class ConditionalBranchNode extends Node<void, void, string> {
		private threshold: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['branch']>) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			return current > this.threshold ? 'over' : 'under'
		}
	}

	const testRegistry = createNodeRegistry({
		set: SetValueNode,
		add: AddValueNode,
		branch: ConditionalBranchNode,
	})

	it('should build and run a complex graph with parallel fan-out', async () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'add-10', type: 'add', data: { value: 10 } }, // Path A
				{ id: 'add-100', type: 'add', data: { value: 100 } }, // Path B
				{ id: 'add-1', type: 'add', data: { value: 1 } }, // Path C, runs in parallel with D
				{ id: 'add-2', type: 'add', data: { value: 2 } }, // Path D, runs in parallel with C
				{ id: 'final', type: 'add', data: { value: 1000 } },
				// TRY THIS: Uncomment the lines below. TypeScript will throw an error!
				// { id: 'error-test', type: 'add', data: { threshold: 99 } },
				// { id: 'error-test', type: 'add', data: { WRONG_PROP: 99 } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'add-10', action: 'under' },
				{ source: 'brancher', target: 'add-100', action: 'over' },
				// Fan-out from 'add-10'
				{ source: 'add-10', target: 'add-1' },
				{ source: 'add-10', target: 'add-2' },
				// Fan-in to 'final'
				{ source: 'add-1', target: 'final' },
				{ source: 'add-2', target: 'final' },
				{ source: 'add-100', target: 'final' },
			],
		}

		const builder = new GraphBuilder(testRegistry)
		const flow = builder.build(graph)
		const ctx = new TypedContext()

		await flow.run(ctx, runOptions)

		expect(ctx.get(VALUE)).toBe(1023)
	})
})
