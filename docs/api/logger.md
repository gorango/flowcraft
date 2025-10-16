# Logger

Loggers provide a consistent way for the runtime and nodes to output information.

## `ILogger` Interface

The interface that all custom loggers must implement.

```typescript
interface ILogger {
	debug: (message: string, meta?: Record<string, any>) => void
	info: (message: string, meta?: Record<string, any>) => void
	warn: (message: string, meta?: Record<string, any>) => void
	error: (message: string, meta?: Record<string, any>) => void
}
```

## `ConsoleLogger` Class

A logger implementation that outputs to the `console`.

## `NullLogger` Class

A logger implementation that performs no action (no-op). This is the default logger if none is provided to the [`FlowRuntime`](/api/runtime#flowruntime-class).
