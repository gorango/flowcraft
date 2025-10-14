# API: Serializer

Serializers are responsible for converting the workflow `Context` to and from a string representation, which is essential for distributed execution and persistence.

## `ISerializer` Interface

The interface that all custom serializers must implement.

```typescript
interface ISerializer {
	serialize: (data: Record<string, any>) => string
	deserialize: (text: string) => Record<string, any>
}
```

## `JsonSerializer` Class

The default serializer, which uses `JSON.stringify` and `JSON.parse`.

> [!WARNING]
> This default implementation is lossy and does not handle complex data types like `Date`, `Map`, `Set`, or class instances. It is recommended to provide a robust serializer like `superjson` if your workflows handle such data.

-   **`serialize(data)`**: Converts a context object to a JSON string.
-   **`deserialize(text)`**: Parses a JSON string back into a context object.
