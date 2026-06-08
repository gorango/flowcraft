# Serializers

The workflow context often needs to be serialized for distributed execution, persistence, or passing initial state as a string.

## The Default: JsonSerializer

Flowcraft's default `JsonSerializer` uses `JSON.stringify()` and `JSON.parse()`. This is simple and universal but cannot represent:

- `Date` objects (converted to strings)
- `Map` and `Set` objects
- `undefined` (omitted)
- Class instances (lose methods and prototype chain)

## The ISerializer Interface

```typescript
interface ISerializer {
	serialize: (data: Record<string, any>) => string
	deserialize: (text: string) => Record<string, any>
}
```

## Using SuperJsonSerializer

For complex data types, use `superjson`:

```typescript
import { ISerializer } from 'flowcraft'
import superjson from 'superjson'

class SuperJsonSerializer implements ISerializer {
	serialize(data: Record<string, any>): string {
		return superjson.stringify(data)
	}
	deserialize(text: string): Record<string, any> {
		return superjson.parse(text) as Record<string, any>
	}
}
```

### Usage

```typescript
const runtime = new FlowRuntime({
	serializer: new SuperJsonSerializer(),
})

const flow = createFlow('date-workflow')
	.node('start', async () => ({ output: new Date() }))
	.toBlueprint()

const result = await runtime.run(flow, {}, { registry: flow.getFunctionRegistry() })

// Date object is preserved
const deserialized = new SuperJsonSerializer().deserialize(result.serializedContext)
console.log(deserialized.start instanceof Date) // true
```

## When to Use a Custom Serializer

| Scenario               | Serializer                                    |
| ---------------------- | --------------------------------------------- |
| Simple JSON data       | `JsonSerializer` (default)                    |
| Date, Map, Set objects | `SuperJsonSerializer`                         |
| Custom class instances | `SuperJsonSerializer` with registered classes |
| Custom binary format   | Implement `ISerializer`                       |

## Distributed Execution

In distributed mode, the context is stored in a remote database (like Redis). A robust serializer ensures data fidelity across serialization boundaries.
