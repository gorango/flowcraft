# Flowcraft DI Container Usage Example

This example demonstrates how to use Flowcraft's dependency injection container system with `FlowRuntime`. It shows the difference between direct service injection and container-based dependency management, and highlights the benefits for testing and complex applications.

## Overview

Flowcraft provides two ways to configure `FlowRuntime` with services:

1. **Direct Configuration**: Pass services directly as options
2. **Container-Based**: Use `createDefaultContainer` for dependency injection

Containers provide benefits for:
- **Testing**: Easy mocking of services
- **Dependency Injection**: Loose coupling between components
- **Service Reuse**: Share services across multiple runtimes
- **Configuration Management**: Centralized service lifecycle

## Running the Example

```bash
cd examples/core-api/simple-container
pnpm install
pnpm dev
```

To see testing demonstrations:

```bash
pnpm dev -- --test-demo
```

## What You'll Learn

1. **Direct vs Container Configuration**: When to use each approach
2. **Testing with Containers**: Mocking services for unit tests
3. **Dependency Injection**: How containers enable loose coupling
4. **Service Reuse**: Sharing services across multiple workflows
5. **Advanced Patterns**: Complex dependency graphs and lifecycle management

## Key Patterns

### Direct Configuration

```typescript
const runtime = new FlowRuntime({
  logger: new ConsoleLogger(),
  registry: { myNode: myFunction },
  serializer: new JsonSerializer()
})
```

### Container Configuration

```typescript
const container = createDefaultContainer({
  logger: new ConsoleLogger(),
  registry: { myNode: myFunction },
  serializer: new JsonSerializer()
})

const runtime = new FlowRuntime(container)
```

### Testing with Mocks

```typescript
const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const container = createDefaultContainer({
  logger: mockLogger,
  registry: { myNode: mockFunction }
})

const runtime = new FlowRuntime(container)
// Now you can verify logger calls, mock node behavior, etc.
```

## When to Use Containers

**Use Direct Configuration when:**
- Simple applications with few services
- No testing requirements
- Services don't need to be shared or mocked

**Use Containers when:**
- Complex applications with many services
- Writing unit tests (easier mocking)
- Services need to be shared across workflows
- Advanced dependency injection patterns
- Custom service lifecycle management
