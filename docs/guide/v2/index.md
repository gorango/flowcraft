# Flowcraft V2: Unified Workflow API

Flowcraft V2 introduces a completely redesigned architecture that unifies the programmatic and declarative approaches into a single, powerful API. The core principle is that **every workflow is a serializable blueprint** that can be built using a fluent, type-safe builder API.

## Key Changes in V2

### 1. Unified Mental Model
- **Single Source of Truth**: All workflows compile to a `WorkflowBlueprint` - a serializable JSON representation
- **Fluent Builder API**: The primary way to define workflows using a chainable, type-safe API
- **Simplified Execution**: One runtime class handles compilation, caching, and execution

### 2. Functions as First-Class Nodes
- **Inline Functions**: Define node logic directly with simple async functions
- **Automatic Serialization**: Built-in support for complex data types (Date, Map, Set, etc.)
- **Type Safety**: Full TypeScript support with generic context types

### 3. Simplified Context Management
- **Synchronous API**: No more `await` on every context operation
- **String Keys**: Simple string-based keys with full type safety
- **Built-in Serialization**: Automatic handling of complex data types

## Quick Start

```typescript
import { createFlow, FlowcraftRuntime } from 'flowcraft'

// Create a simple workflow
const workflow = createFlow<{ count: number, items: string[] }>('my-workflow')
	.node('start', async ({ context }) => {
		return { output: { count: 0, items: [] } }
	})
	.node('process', async ({ context, input }) => {
		const newCount = input.count + 1
		const newItems = [...input.items, `item-${newCount}`]
		return { output: { count: newCount, items: newItems } }
	})
	.node('finish', async ({ context, input }) => {
		console.log(`Processed ${input.count} items:`, input.items)
		return { output: input }
	})

// Convert to blueprint
const blueprint = workflow.toBlueprint()

// Execute with runtime
const runtime = new FlowcraftRuntime({
	registry: {},
	environment: 'development'
})

const result = await runtime.run(blueprint, { count: 0, items: [] })
console.log('Final result:', result.context)
```

## Core Concepts

### WorkflowBlueprint
The central, serializable representation of any workflow:

```typescript
interface WorkflowBlueprint {
	id: string
	metadata?: {
		name?: string
		description?: string
		version?: string
	}
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	inputs?: Record<string, any>
	outputs?: Record<string, any>
}
```

### Fluent Builder API
The `Flow` class provides a chainable API for building workflows:

```typescript
const flow = createFlow<MyContext>('my-flow')
  .node('id', implementation, params?, config?)
  .edge('source', 'target', options?)
  .parallel(['node1', 'node2'], 'merge-node')
  .batch('input', 'output', { batchSize: 10 })
  .toBlueprint();
```

### Runtime Execution
The `FlowcraftRuntime` handles everything from compilation to execution:

```typescript
const runtime = new FlowcraftRuntime({
	registry: { /* node implementations */ },
	environment: 'production'
})

const result = await runtime.run(blueprint, initialContext)
```

## Migration Guide

### From V1 Programmatic API
**Before (V1):**
```typescript
const flow = new Flow()
	.node('start', StartNode)
	.node('process', ProcessNode)
	.node('end', EndNode)

await flow.run(initialContext)
```

**After (V2):**
```typescript
const workflow = createFlow('my-workflow')
	.node('start', StartNode)
	.node('process', ProcessNode)
	.node('end', EndNode)

const blueprint = workflow.toBlueprint()
const result = await runtime.run(blueprint, initialContext)
```

### From V1 Declarative API
**Before (V1):**
```typescript
const blueprint = {
  nodes: [...],
  edges: [...]
};

const executor = new BlueprintExecutor(registry);
await executor.execute(blueprint, context);
```

**After (V2):**
```typescript
const blueprint = createFlow('my-workflow')
	.node('node1', implementation)
	.edge('node1', 'node2')
	.toBlueprint()

const result = await runtime.run(blueprint, initialContext)
```

## Advanced Patterns

### Parallel Execution
```typescript
const workflow = createFlow('parallel-example')
	.node('input', async () => ({ output: [1, 2, 3, 4, 5] }))
	.parallel(['process1', 'process2'], 'merge')
	.node('process1', async ({ input }) => {
		return { output: input.map((x: number) => x * 2) }
	})
	.node('process2', async ({ input }) => {
		return { output: input.map((x: number) => x + 10) }
	})
	.node('merge', async ({ context }) => {
		const results = await Promise.all([
			context.get('process1_output'),
			context.get('process2_output')
		])
		return { output: results.flat() }
	})
```

### Conditional Branching
```typescript
const workflow = createFlow('conditional-example')
	.node('check', async ({ input }) => {
		return {
			output: input.value > 10 ? 'high' : 'low',
			action: input.value > 10 ? 'HIGH' : 'LOW'
		}
	})
	.node('high', async ({ input }) => ({ output: `High value: ${input}` }))
	.node('low', async ({ input }) => ({ output: `Low value: ${input}` }))
	.edge('check', 'high', { action: 'HIGH' })
	.edge('check', 'low', { action: 'LOW' })
```

### Sub-Workflows
```typescript
// Register sub-blueprint
runtime.registerBlueprint(subWorkflowBlueprint)

const mainWorkflow = createFlow('main-workflow')
	.node('subflow', 'subflow', {
		blueprintId: 'sub-workflow-id',
		inputs: { parentData: 'input' },
		outputs: { result: 'output' }
	})
```

## Best Practices

1. **Use Functions for Simple Logic**: Define most nodes as inline async functions
2. **Reserve Classes for Reusability**: Use classes only for complex, reusable components
3. **Leverage Type Safety**: Use generic context types for better IDE support
4. **Keep Blueprints Serializable**: Avoid closures and external dependencies in node functions
5. **Use Runtime Caching**: The runtime automatically caches compiled flows for better performance

## API Reference

See the [API Reference](../../api-reference/) for detailed information about all classes and methods.
