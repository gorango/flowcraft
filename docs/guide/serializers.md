# Serializers

The workflow `Context` often needs to be serialized, especially when:
-   Running in a distributed system where the context is stored in a remote database (like Redis).
-   Persisting the final state of a completed workflow.
-   Passing initial state to the `runtime.run()` method as a string.

## The Default: `JsonSerializer`

Flowcraft's default serializer, `JsonSerializer`, uses `JSON.stringify()` and `JSON.parse()`. This is simple and universal, but it has limitations. Standard JSON cannot represent complex data types like:

-   `Date` objects (are converted to strings)
-   `Map` and `Set` objects
-   `undefined` (is omitted)
-   Class instances (lose their methods and prototype chain)

## Replacing the Serializer

If your workflows need to handle complex data types, you can provide a custom serializer that implements the `ISerializer` interface.

#### The `ISerializer` Interface

```typescript
interface ISerializer {
	serialize: (data: Record<string, any>) => string
	deserialize: (text: string) => Record<string, any>
}
```

#### Example: Using `superjson`

[superjson](https://www.npmjs.com/package/superjson) is an excellent library that extends JSON to support a wide range of types, including dates, maps, sets, and class instances.

1.  **Install `superjson`**:
	```bash
	npm install superjson
	```

2.  **Create a `SuperJsonSerializer` class**:
	```typescript
	import { ISerializer } from 'flowcraft'
	import superjson from 'superjson'

	class SuperJsonSerializer implements ISerializer {
		serialize(data: Record<string, any>): string {
			return superjson.stringify(data)
		}

		deserialize(text: string): Record<string, any> {
			// SuperJSON parse returns `unknown`, so we cast it.
			return superjson.parse(text) as Record<string, any>
		}
	}
	```
	If you are serializing custom classes, you may need to register them with `superjson` first.

3.  **Provide it to the `FlowRuntime`**:
	```typescript
	const runtime = new FlowRuntime({
		serializer: new SuperJsonSerializer(),
	})

	// Now, let's run a workflow that uses a Date object.
	const flow = createFlow('date-workflow')
		.node('start', async () => ({ output: new Date() }))
		.toBlueprint()

	const result = await runtime.run(flow, {}, { functionRegistry: flow.getFunctionRegistry() })

	// The serialized context will now contain extended JSON from superjson.
	console.log(result.serializedContext)

	// If you deserialize it, the Date object is preserved.
	const deserialized = new SuperJsonSerializer().deserialize(result.serializedContext)
	console.log(deserialized.start instanceof Date) // true
	```

By plugging in a powerful serializer like `superjson`, you can maintain data fidelity throughout your workflows.
