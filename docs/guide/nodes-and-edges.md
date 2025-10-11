# Nodes and Edges

Nodes and edges are the core components of any workflow. Nodes define *what* happens, and edges define *when* it happens.

## Nodes: The Units of Work

A node is a single, executable task. Flowcraft offers two primary ways to implement a node's logic.

### Function-Based Nodes

For simple, self-contained logic, an `async` function is the easiest approach. The function receives a `NodeContext` object and must return a `NodeResult`.

```typescript
import { NodeContext, NodeResult } from 'flowcraft'

async function fetchUserData(ctx: NodeContext): Promise<NodeResult> {
	const userId = ctx.input // Assume input is the user ID
	// const user = await db.users.find(userId);
	const user = { id: userId, name: 'Mock User' } // Mock
	return { output: user }
}

// Usage in a flow:
// .node("fetch-user", fetchUserData)
```

### Class-Based Nodes

For more complex logic, dependency injection, or better testability, you can extend the `BaseNode` class. This provides a structured lifecycle.

-   **`prep()`**: Prepares data for execution. This phase is **not** retried on failure.
-   **`exec()`**: Contains the core, isolated logic. This is the **only** phase that is retried.
-   **`post()`**: Processes the result from `exec` or `fallback`. Not retried.
-   **`fallback()`**: An optional safety net that runs if all `exec` retries fail.

```typescript
import { BaseNode, NodeContext, NodeResult } from 'flowcraft'

// Example: A node to multiply a value by a factor passed in params
class MultiplyNode extends BaseNode {
	// `params` are passed from the node definition in the blueprint
	constructor(protected params: { factor: number }) {
		super(params)
	}

	// The 'exec' method contains the core logic
	async exec(
		prepResult: number, // The result from `prep()`
		context: NodeContext
	): Promise<Omit<NodeResult, 'error'>> {
		if (typeof prepResult !== 'number') {
			throw new TypeError('Input must be a number.')
		}
		const result = prepResult * this.params.factor
		return { output: result }
	}
}

// Usage in a flow:
// .node("multiply", MultiplyNode, { params: { factor: 3 } })
```

## Edges: Defining Control Flow

Edges connect nodes, creating the directed graph. They can be simple dependencies or include powerful control flow logic.

### Simple Edges

A simple edge just defines an order of execution.

```typescript
// Run 'B' after 'A' completes successfully
flow.edge('A', 'B')
```

### Edge Options

You can add an options object to `.edge()` to control branching and data transformation.

-   **`action`**: The edge is only taken if the source node returns a matching `action` string in its result. This is the primary way to implement conditional branching.
-   **`condition`**: A string expression that is evaluated at runtime. The edge is only taken if the expression evaluates to `true`. This allows for more complex, data-driven conditions.
-   **`transform`**: A string expression that modifies the data flowing from the source node to the target node.

#### Example: `action` and `condition`

```typescript
// In node 'check-user':
// return { action: user.isAdmin ? 'admin' : 'guest' };

flow
	.edge('check-user', 'admin-dashboard', { action: 'admin' })
	.edge('check-user', 'guest-dashboard', { action: 'guest' })
```

```typescript
// Edge with a condition based on the source node's output
flow
	.edge('fetch-data', 'process-large-dataset', {
		condition: 'result.output.length > 100'
	})
```
