# Builder API Reference

The Flowcraft V2 Builder API provides a fluent, type-safe way to construct workflows programmatically. All workflows are built using the `Flow` class and compile to a `WorkflowBlueprint`.

## Basic Usage

```typescript
import { createFlow } from 'flowcraft'

const workflow = createFlow<MyContext>('my-workflow')
	.node('start', async ({ context, input }) => {
		return { output: 'Hello, World!' }
	})
	.node('process', async ({ context, input }) => {
		return { output: input.toUpperCase() }
	})
	.node('end', async ({ context, input }) => {
		console.log('Final result:', input)
		return { output: input }
	})
```

## Node Definition

### Function-Based Nodes
The simplest way to define a node is with an inline async function:

```typescript
.node('node-id', async ({ context, input, params }) => {
  // Your node logic here
  const result = await someAsyncOperation(input);

  return {
    output: result,
    action: 'SUCCESS' // Optional: for branching
  };
})
```

### Class-Based Nodes
For reusable, complex nodes, use classes:

```typescript
class MyNode {
  constructor(private params: any) {}

  async execute(context: NodeContext) {
    // Node logic here
    return { output: 'result' };
  }
}

.node('my-node', MyNode, { param1: 'value' })
```

### Registered Nodes
Reference nodes from the runtime registry:

```typescript
.node('api-call', 'http-request', {
  url: 'https://api.example.com',
  method: 'POST'
})
```

## Edge Definition

### Basic Edges
Connect nodes in sequence:

```typescript
.edge('source-node', 'target-node')
```

### Conditional Edges
Add conditions and actions for branching:

```typescript
.edge('source', 'target', {
  action: 'SUCCESS',
  condition: 'result.status === "ok"',
  transform: 'data => data.value'
})
```

### Multiple Edges
Define multiple edges at once:

```typescript
.edges(
  { source: 'node1', target: 'node2' },
  { source: 'node1', target: 'node3', action: 'ERROR' }
)
```

## Advanced Patterns

### Parallel Execution
Execute multiple nodes in parallel:

```typescript
.parallel(['node1', 'node2', 'node3'], 'merge-node', {
  strategy: 'all' // 'all', 'any', or 'race'
})
```

### Batch Processing
Process data in batches:

```typescript
.batch('input-node', 'output-node', {
  batchSize: 10,
  concurrency: 3
})
```

### Conditional Branching
Create conditional logic:

```typescript
.condition('check-node', [
  { condition: 'input.value > 10', target: 'high-node' },
  { condition: 'input.value <= 10', target: 'low-node' }
], 'default-node')
```

### Loops
Create iterative patterns:

```typescript
.loop('start-node', 'end-node', {
  maxIterations: 100,
  condition: 'context.counter < 10'
})
```

## Context Management

### Type-Safe Context
Define your context type for full type safety:

```typescript
interface MyContext {
	userId: string
	preferences: Record<string, any>
	results: string[]
}

const workflow = createFlow<MyContext>('typed-workflow')
	.node('get-user', async ({ context }) => {
		const userId = context.get('userId') // Fully typed
		return { output: { id: userId } }
	})
```

### Context Operations
```typescript
// In node functions
const value = context.get('key')
context.set('key', newValue)
const exists = context.has('key')
```

## Workflow Metadata

Add metadata to your workflows:

```typescript
const workflow = createFlow('my-workflow')
	.metadata({
		name: 'User Registration Flow',
		description: 'Handles new user registration',
		version: '1.0.0',
		tags: ['user', 'registration']
	})
	.inputs({
		email: 'string',
		password: 'string'
	})
	.outputs({
		userId: 'string',
		status: 'string'
	})
```

## Blueprint Compilation

Convert your workflow to a serializable blueprint:

```typescript
const blueprint = workflow.toBlueprint()

// The blueprint is a plain JSON object
console.log(JSON.stringify(blueprint, null, 2))
```

## Error Handling

Handle errors gracefully:

```typescript
.node('risky-operation', async ({ context, input }) => {
  try {
    const result = await riskyAsyncOperation(input);
    return { output: result };
  } catch (error) {
    return {
      error: {
        message: error.message,
        code: 'OPERATION_FAILED'
      }
    };
  }
})
```

## Best Practices

1. **Keep Nodes Pure**: Nodes should be stateless and side-effect free when possible
2. **Use Descriptive IDs**: Node IDs should clearly indicate their purpose
3. **Leverage TypeScript**: Use generic context types for better development experience
4. **Handle Errors Explicitly**: Always consider error cases in your node logic
5. **Keep It Serializable**: Avoid closures and external dependencies in node functions
