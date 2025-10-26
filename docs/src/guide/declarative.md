# Declarative Workflows

Flowcraft allows defining workflows using JSON blueprints, decoupling structure from implementation. The primary difference from programmatic workflows is separating the `WorkflowBlueprint` (the JSON structure) from the `NodeRegistry` (the code implementations), which allows for dynamic workflow generation or storage in a database.

## Node Registry

First, create a registry of reusable node functions.

```typescript
const nodeRegistry = {
  takeOrderFn: async ({ context }) => {
    const order = { item: 'Coffee', size: 'Medium' }
    await context.set('order', order)
    return { output: order }
  },
  makeDrinkFn: async ({ input, context }) => {
    const order = input as { item: string; size: string }
    return { output: `Made ${order.size} ${order.item}` }
  },
  serveCustomerFn: async ({ input }) => {
    return { output: `Served: ${input}` }
  }
}
```

## Workflow Blueprint

Define the workflow as a JSON object.

```json
{
  "id": "coffee-shop-order",
  "nodes": [
    {
      "id": "take-order",
      "uses": "takeOrderFn",
    },
    {
      "id": "make-drink",
      "uses": "makeDrinkFn",
      "inputs": "take-order"
    },
    {
      "id": "serve-customer",
      "uses": "serveCustomerFn",
      "inputs": "make-drink"
    }
  ],
  "edges": [
    {
      "source": "take-order",
      "target": "make-drink"
    },
    {
      "source": "make-drink",
      "target": "serve-customer"
    }
  ]
}
```

## Execution

Load and run the blueprint with the registry.

```typescript
import { FlowRuntime } from 'flowcraft'

const runtime = new FlowRuntime({ registry: nodeRegistry })
const result = await runtime.run(
	blueprint,
	{ /* Initial context */ },
	{ functionRegistry: nodeRegistry }
)
```

This approach separates workflow structure from code, enabling dynamic configurations.

## Demo

This workflow can be visualized and run in the demo below:

<DemoDeclarative />
