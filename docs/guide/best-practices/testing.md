# Best Practices: Testing Workflows

Testing is crucial for building robust and reliable workflows. Flowcraft's design, which separates data preparation (`prep`), core logic (`exec`), and state updates (`post`), makes testing straightforward. This guide covers strategies for testing individual nodes and entire flows.

## Testing Individual Nodes

The most important part of a `Node` to test is its `exec` method, as it contains the core business logic. Because `exec` is designed to be pure—receiving all its input from `prep` and not accessing the `Context` directly—you can test it in complete isolation.

### Strategy: Test `exec` Directly

You can instantiate your node and call its `_exec` method (the internal method that includes retry logic) or `exec` method directly, providing mock `NodeArgs`.

**Example: Testing a data transformation node**

Let's assume you have this node:

```typescript
import { Node } from 'flowcraft'

// src/nodes.ts
class UserProcessorNode extends Node<{ name: string, email: string }, { fullName: string, domain: string }> {
	async exec({ prepRes: user }) {
		if (!user.name || !user.email) {
			throw new Error('Invalid user data')
		}
		return {
			fullName: user.name.toUpperCase(),
			domain: user.email.split('@')[1],
		}
	}
}
```

Here's how you could test it using a testing framework like Vitest or Jest:

```typescript
import { NullLogger } from 'flowcraft'
// src/nodes.test.ts
import { UserProcessorNode } from './nodes'

describe('UserProcessorNode', () => {
	it('should correctly process valid user data', async () => {
		const node = new UserProcessorNode()
		const mockArgs = {
			prepRes: { name: 'Alice', email: 'alice@example.com' },
			logger: new NullLogger(),
			// other args can be mocked as needed
		}

		const result = await node.exec(mockArgs)

		expect(result).toEqual({
			fullName: 'ALICE',
			domain: 'example.com',
		})
	})

	it('should throw an error for invalid user data', async () => {
		const node = new UserProcessorNode()
		const mockArgs = {
			prepRes: { name: '', email: 'no-name@test.com' },
			logger: new NullLogger(),
		}

		await expect(node.exec(mockArgs)).rejects.toThrow('Invalid user data')
	})
})
```

## Testing `prep` and `post`

To test the full lifecycle of a node, including its interaction with the `Context`, you can use the node's `.run()` method.

### Strategy: Use `.run()` and inspect the Context

1. Create a `TypedContext` and pre-populate it with any data your node's `prep` phase needs.
2. Call `node.run(context)`.
3. Assert that the `Context` contains the expected values after the run, which tests your `post` logic.

**Example: Testing a node that interacts with context**

```typescript
import { contextKey, Node } from 'flowcraft'

// src/nodes.ts
const INPUT = contextKey<number>('input')
const OUTPUT = contextKey<number>('output')

class AddTenNode extends Node {
	async prep({ ctx }) {
		return ctx.get(INPUT) || 0
	}

	async exec({ prepRes: value }) {
		return value + 10
	}

	async post({ ctx, execRes: result }) {
		ctx.set(OUTPUT, result)
	}
}
```

And the test:

```typescript
// src/nodes.test.ts
import { TypedContext } from 'flowcraft'

describe('AddTenNode', () => {
	it('should read from, and write to, the context correctly', async () => {
		const node = new AddTenNode()
		const context = new TypedContext([
			[INPUT, 5]
		])

		await node.run(context)

		expect(context.get(OUTPUT)).toBe(15)
	})
})
```

## Testing Flows

When testing a `Flow`, you are performing an integration test to ensure that all the nodes work together correctly and that the `Context` state evolves as expected.

### Strategy: Run the Flow and Assert Final Context State

The approach is similar to testing a single node with `.run()`, but you do it for the entire `Flow`.

```typescript
import { contextKey, SequenceFlow, TypedContext } from 'flowcraft'

const INITIAL_DATA = contextKey<string>('initial_data')
const FINAL_RESULT = contextKey<string>('final_result')
const SOME_INTERMEDIATE_VALUE = contextKey<any>('intermediate')

describe('DataProcessingFlow', () => {
	it('should run the full sequence and produce the correct final output', async () => {
		// Assume NodeA, NodeB, NodeC are defined elsewhere
		const flow = new SequenceFlow(new NodeA(), new NodeB(), new NodeC())
		const context = new TypedContext([
			[INITIAL_DATA, 'start']
		])

		await flow.run(context)

		// Assert the final state of the context after the whole flow has run
		expect(context.get(FINAL_RESULT)).toBe('expected-final-value')
		expect(context.get(SOME_INTERMEDIATE_VALUE)).toBeUndefined() // Verify cleanup if applicable
	})
})
```

### Testing Branching Logic

To test conditional branching, create separate tests for each path. In each test, set up the `Context` in a way that forces the flow to take the specific branch you want to verify.

```typescript
import { contextKey } from 'flowcraft'

const IS_VALID = contextKey<boolean>('is_valid')
const PATH_TAKEN = contextKey<string>('path_taken')

it('should take the "success" path when data is valid', async () => {
	const flow = createMyConditionalFlow()
	const context = new TypedContext([
		[IS_VALID, true] // Force the success path
	])

	await flow.run(context)

	expect(context.get(PATH_TAKEN)).toBe('success-path')
})

it('should take the "error" path when data is invalid', async () => {
	const flow = createMyConditionalFlow()
	const context = new TypedContext([
		[IS_VALID, false] // Force the error path
	])

	await flow.run(context)

	expect(context.get(PATH_TAKEN)).toBe('error-path')
})
```
