# Common Errors and Troubleshooting

## Stalled workflows

**Symptom:** `result.status === 'stalled'`

**Causes:**

- A node has no incoming edges and is not a start node
- All paths to a node are blocked by unmet conditions
- A join node is waiting for predecessors that never complete

**Fix:**

```typescript
// Check blueprint structure
const analysis = analyzeBlueprint(blueprint)
console.log('Start nodes:', analysis.startNodes)
console.log('Terminal nodes:', analysis.terminalNodes)
console.log('Has cycles:', analysis.hasCycle)

// Visualize the graph
console.log(generateMermaid(blueprint))

// Verify all nodes are reachable
const lint = lintBlueprint(blueprint, registry)
console.log('Lint errors:', lint)
```

## Missing node implementations

**Symptom:** `FlowcraftError: No implementation found for node 'xyz'`

**Causes:**

- Node `uses` key not registered in the function registry
- Typo in node ID or uses key

**Fix:**

```typescript
// Ensure all uses keys are registered
const registry = {
	fetchFn: fetchFn,
	processFn: processFn,
	storeFn: storeFn,
}

// For fluent API, the functions are auto-registered
// For declarative JSON, you must provide the registry:
const runtime = new FlowRuntime({ registry })
// Or pass it to run():
await runtime.run(blueprint, {}, { functionRegistry: registry })
```

## Cycle detection errors

**Symptom:** `FlowcraftError: Cycle detected in workflow`

**Causes:**

- Circular edges in the graph (unless using loops intentionally)

**Fix:**

```typescript
// Check for cycles before running
const analysis = analyzeBlueprint(blueprint)
if (analysis.hasCycle) {
	console.log('Cycles detected:', analysis.cycles)
}

// Use .loop() for intentional iteration
const flow = createFlow('my-flow')
	.node('a', async () => ({ output: 'a' }))
	.node('b', async () => ({ output: 'b' }))
	.edge('a', 'b')
	.loop('my-loop', {
		startNodeId: 'a',
		endNodeId: 'b',
		condition: 'context.iteration < 5',
	})
```

## Edge condition evaluation failures

**Symptom:** Edges not being followed despite expected conditions

**Causes:**

- Condition expression references wrong variable
- Action string mismatch between node return and edge config
- Evaluator not configured correctly

**Fix:**

```typescript
// Ensure action strings match exactly
const flow = createFlow('branch')
	.node('decide', async () => {
		// Must return exact action string
		return { output: 'data', action: 'approved' } // not 'approve'
	})
	.node('process', async () => ({ output: 'done' }))
	.edge('decide', 'process', { action: 'approved' }) // must match

	// For condition expressions, use the PropertyEvaluator (default)
	// which safely evaluates against input and context
	.edge('a', 'b', { condition: 'input.value > 10' })
```

## Retry and timeout issues

**Symptom:** Nodes retrying unexpectedly or timing out

**Causes:**

- External service temporarily unavailable
- Timeout too aggressive for the operation
- Retry delay causing cascading delays

**Fix:**

```typescript
// Configure appropriate retry settings
const flow = createFlow('resilient').node('api-call', async () => ({ output: await callApi() }), {
	config: {
		maxRetries: 3, // Number of retry attempts
		retryDelay: 2000, // ms between retries
		timeout: 10000, // ms before timeout
		fallback: 'fallback-node', // Node to run on total failure
	},
})

// Only exec() phase is retried in class-based nodes
class ApiNode extends BaseNode {
	async prep(ctx) {
		return { url: '...' }
	} // NOT retried
	async exec(ctx, prep) {
		return callApi()
	} // ONLY retried
	async fallback(ctx, error) {
		// Called after all retries fail
		return { output: getCachedData() }
	}
}
```

## Context type mismatches

**Symptom:** TypeScript errors or runtime undefined values

**Causes:**

- Context interface doesn't match actual usage
- Reading a key that was never set

**Fix:**

```typescript
// Define complete context interface
interface MyContext {
	userId: string
	order?: Order // Optional if set during execution
	result?: Result // Optional if set during execution
}

const flow = createFlow<MyContext>('flow')
	.node('init', async ({ context }) => {
		context.set('userId', '123')
		return { output: 'ready' }
	})
	.node('process', async ({ context }) => {
		// TypeScript will warn if key not in MyContext
		const userId = context.get('userId')
		return { output: userId }
	})
```

## Blueprint validation errors

**Symptom:** `lintBlueprint()` returns errors

**Common lint errors:**

- `missing-implementation`: Node `uses` key not in registry
- `orphan-node`: Node has no incoming or outgoing edges
- `invalid-edge`: Edge references non-existent node
- `unreachable-node`: Node cannot be reached from any start node

**Fix:**

```typescript
const lint = lintBlueprint(blueprint, registry)
if (lint.errors.length > 0) {
	for (const error of lint.errors) {
		console.log(`${error.nodeId}: ${error.message}`)
	}
}
```
