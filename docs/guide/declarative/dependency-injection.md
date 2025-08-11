# Dependency Injection

When building real-world workflows, your nodes will often need to interact with external services like databases, APIs, or logging systems. Hard-coding these services directly into your `Node` classes makes them difficult to test and tightly couples them to a specific implementation.

The `GraphBuilder` solves this with a powerful, **type-safe dependency injection** mechanism. This allows you to provide shared services to all nodes created by the builder at runtime.

## The `nodeOptionsContext`

The second argument to the `GraphBuilder` constructor is the `nodeOptionsContext`. This is a plain JavaScript object that you can use to provide any dependencies your nodes might need.

When the builder creates a `Node` instance, it passes this entire context object to the node's constructor, merged with the `data` payload from the graph definition.

## The Type-Safe Pattern

To get the full benefits of type safety with TypeScript, you should follow this four-step pattern.

### Step 1: Define the Shape of Your Dependencies

Create an interface that defines the contract for all the shared services your application's nodes will use.

```typescript
// src/types.ts
export interface MyAppDependencies {
	apiClient: {
		fetch: (path: string) => Promise<any>
	},
	db: {
		save: (key: string, data: any) => Promise<void>
	}
}
```

### Step 2: Define Your Node Type Map

As always, define a `NodeTypeMap` for your declarative graph nodes.

```typescript
// src/types.ts
export interface MyNodeTypeMap {
	'fetch-user': { userId: number },
	'save-user': { userKey: string }
}
```

### Step 3: Create Nodes That Use the Injected Dependencies

In your `Node`'s constructor, you can now expect the dependencies to be present and fully typed. The key is to use the `NodeConstructorOptions` type, which is generic over both the node's `data` payload and the dependency context.

```typescript
import { Node, NodeConstructorOptions } from 'flowcraft'
import { MyAppDependencies, MyNodeTypeMap } from './types'

// This node uses the `apiClient` dependency.
class FetchUserNode extends Node {
	private userId: number
	private apiClient: MyAppDependencies['apiClient']

	// The constructor options are now typed with our dependencies!
	constructor(options: NodeConstructorOptions<MyNodeTypeMap['fetch-user'], MyAppDependencies> & MyAppDependencies) {
		super()
		this.userId = options.data.userId
		// The dependency is available on the options object.
		this.apiClient = options.apiClient
	}

	async exec() {
		return this.apiClient.fetch(`/users/${this.userId}`)
	}
}
```
> [!TIP]
> The constructor signature `NodeConstructorOptions<..., TContext> & TContext` is the standard pattern. It ensures that the `data` property is correctly typed, and that all properties from your `TContext` dependency interface are available at the top level of the `options` object.

### Step 4: Instantiate the Builder with Dependencies

Finally, create a type-safe `NodeRegistry` and pass your concrete dependency implementations to the `GraphBuilder` constructor.

```typescript
import { createNodeRegistry, GraphBuilder } from 'flowcraft'

// Create a type-safe registry that is aware of our dependency context.
const registry = createNodeRegistry<MyNodeTypeMap, MyAppDependencies>({
	'fetch-user': FetchUserNode,
	// ... other nodes
})

// Create concrete instances of our services.
const myApi = { fetch: async (path) => ({ name: 'Alice' }) }
const myDb = { save: async (key, data) => { /* ... */ } }

// Instantiate the builder, providing the registry and the dependencies.
// TypeScript will ensure that the object you pass here matches the
// `MyAppDependencies` interface.
const builder = new GraphBuilder(registry, {
	apiClient: myApi,
	db: myDb,
})

// Now, when the builder creates a `FetchUserNode`, it will receive
// the `myApi` instance in its constructor.
const { blueprint } = builder.buildBlueprint(myGraph)
```

By following this pattern, you gain several key advantages:
- **Decoupling**: Your nodes depend on an `interface`, not a concrete implementation.
- **Testability**: In your tests, you can pass mock implementations of your services to the `GraphBuilder`, allowing you to test your nodes in complete isolation.
- **Compile-Time Safety**: TypeScript will prevent you from forgetting a dependency or providing one with the wrong shape, catching a whole class of configuration errors before your code ever runs.
