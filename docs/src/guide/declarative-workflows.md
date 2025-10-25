<script setup>
import DeclarativeWorkflowsDemo from '../.vitepress/theme/components/Demo/DeclarativeWorkflows.vue'
</script>

# Declarative Workflows

Flowcraft allows defining workflows using JSON blueprints, decoupling structure from implementation.

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
      "data": {}
    },
    {
      "id": "make-drink",
      "uses": "makeDrinkFn",
      "data": {
        "inputs": "take-order"
      }
    },
    {
      "id": "serve-customer",
      "uses": "serveCustomerFn",
      "data": {
        "inputs": "make-drink"
      }
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

<DeclarativeWorkflowsDemo />

## Execution

Load and run the blueprint with the registry.

```typescript
import { FlowRuntime } from 'flowcraft'

const runtime = new FlowRuntime({ registry: nodeRegistry })
const result = await runtime.run(blueprint, {}, { functionRegistry: nodeRegistry })
```

This approach separates workflow structure from code, enabling dynamic configurations.
