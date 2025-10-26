# Dependency Injection Container

The Dependency Injection (DI) container provides a centralized way to manage services and dependencies in Flowcraft, enabling loose coupling, easier testing, and better modularity.

## `DIContainer` Class

A lightweight dependency injection container for managing services.

### `register<T>(token, implementation)`

Registers a service instance directly.

-   **`token`** `ServiceToken<T>`: A unique token (string or symbol) identifying the service.
-   **`implementation`** `T`: The service instance to register.

### `registerFactory<T>(token, factory)`

Registers a factory function for lazy instantiation of a service.

-   **`token`** `ServiceToken<T>`: A unique token identifying the service.
-   **`factory`** `(container: DIContainer) => T`: A function that creates the service instance, receiving the container for dependency resolution.

### `resolve<T>(token)`

Resolves and returns a service instance.

-   **`token`** `ServiceToken<T>`: The token of the service to resolve.
-   **Returns** `T`: The service instance.
-   **Throws** `Error`: If the service is not registered.

### `has(token)`

Checks if a service is registered.

-   **`token`** `ServiceToken`: The token to check.
-   **Returns** `boolean`: `true` if the service is registered, otherwise `false`.

### `createChild()`

Creates a child container that inherits all services from the parent.

-   **Returns** `DIContainer`: A new child container.

## `ServiceTokens`

Predefined symbolic tokens for core services:

-   **`Logger`**: `Symbol.for('flowcraft:logger')` - Logging implementation.
-   **`Serializer`**: `Symbol.for('flowcraft:serializer')` - Context serialization.
-   **`Evaluator`**: `Symbol.for('flowcraft:evaluator')` - Expression evaluation.
-   **`EventBus`**: `Symbol.for('flowcraft:eventBus')` - Event publishing.
-   **`Orchestrator`**: `Symbol.for('flowcraft:orchestrator')` - Workflow orchestration.
-   **`Middleware`**: `Symbol.for('flowcraft:middleware')` - Middleware array.
-   **`NodeRegistry`**: `Symbol.for('flowcraft:nodeRegistry')` - Node implementations.
-   **`BlueprintRegistry`**: `Symbol.for('flowcraft:blueprintRegistry')` - Blueprint registry.
-   **`Dependencies`**: `Symbol.for('flowcraft:dependencies')` - Custom dependencies.

## `createDefaultContainer(options?)`

Creates a pre-configured container with default services.

-   **`options?`** `ContainerOptions<TDependencies>`: Optional overrides for default services.
     -   **`logger?`**: Custom logger (defaults to `NullLogger`).
     -   **`serializer?`**: Custom serializer (defaults to `JsonSerializer`).
     -   **`evaluator?`**: Custom evaluator (defaults to `PropertyEvaluator`).
     -   **`eventBus?`**: Custom event bus (defaults to no-op).
     -   **`middleware?`**: Custom middleware array (defaults to empty).
     -   **`registry?`**: Node registry (defaults to empty).
     -   **`blueprints?`**: Blueprint registry (defaults to empty).
     -   **`dependencies?`**: Custom dependencies (defaults to empty).
-   **Returns** `DIContainer`: A configured container.

## Usage Example

```typescript
import { createDefaultContainer, FlowRuntime, ServiceTokens, ConsoleLogger } from 'flowcraft'

const container = createDefaultContainer({
  registry: { fetchData, processData },
  logger: new ConsoleLogger(),
})

const runtime = new FlowRuntime(container)
await runtime.run(blueprint)
```