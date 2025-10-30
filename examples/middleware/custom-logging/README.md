# Custom Logging Middleware

This example demonstrates how to create and use custom middleware for logging in Flowcraft workflows. Middleware allows you to intercept and augment node execution with cross-cutting concerns like logging, monitoring, and error handling.

## Overview

Flowcraft middleware provides hooks that run before and after node execution. This example shows:

- Creating a custom logging middleware that logs node execution
- Integrating middleware with the Flowcraft runtime
- Demonstrating different logging levels and structured logging

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## What You'll Learn

### 1. Creating Custom Middleware

Middleware implements the `Middleware` interface with an `aroundNode` method:

```typescript
class LoggingMiddleware implements Middleware {
  async aroundNode(
    ctx: ContextImplementation,
    nodeId: string,
    next: () => Promise<NodeResult>
  ): Promise<NodeResult> {
    console.log(`[LOG] Starting node: ${nodeId}`)
    const result = await next()
    console.log(`[LOG] Completed node: ${nodeId}`)
    return result
  }
}
```

### 2. Integrating Middleware with Runtime

Add middleware to the runtime configuration:

```typescript
const runtime = new FlowRuntime({
  middleware: [new LoggingMiddleware()],
})
```

### 3. Structured Logging

Use context and metadata for rich logging:

```typescript
const startTime = Date.now()
const result = await next()
const duration = Date.now() - startTime

logger.info(`Node ${nodeId} completed`, {
  duration,
  nodeId,
  blueprintId: await ctx.get('blueprintId'),
})
```

## Expected Output

```
🚀 Flowcraft Custom Logging Middleware Example

============================================================
📝 BASIC LOGGING EXAMPLE
============================================================

[LOG] Starting workflow execution
[LOG] Starting node: prepareData
[LOG] Preparing data for processing...
[LOG] Completed node: prepareData
[LOG] Starting node: processData
[LOG] Processing data...
[LOG] Completed node: processData
[LOG] Starting node: finalize
[LOG] Finalizing workflow...
[LOG] Completed node: finalize
[LOG] Workflow execution completed

📊 Basic Logging Results:
   Workflow completed successfully with logging

============================================================
📊 STRUCTURED LOGGING EXAMPLE
============================================================

[STRUCTURED] Node prepareData started at 2024-01-15T10:30:00.000Z
[STRUCTURED] Node prepareData completed in 5ms
[STRUCTURED] Node processData started at 2024-01-15T10:30:00.005Z
[STRUCTURED] Node processData completed in 10ms
[STRUCTURED] Node finalize started at 2024-01-15T10:30:00.015Z
[STRUCTURED] Node finalize completed in 3ms

📈 Structured Logging Results:
   All nodes executed with timing information
   Total workflow duration: 18ms

============================================================
🚨 ERROR LOGGING EXAMPLE
============================================================

[ERROR] Node failingNode started
[ERROR] Node failingNode failed: Simulated error
[ERROR] Node failingNode error details: Simulated error

🚨 Error Logging Results:
   Error was logged and propagated correctly

🎉 All custom logging middleware examples completed!
```

## Key Concepts Demonstrated

- **Middleware Pattern**: Intercepting node execution for cross-cutting concerns
- **Around Advice**: Wrapping node execution with before/after logic
- **Structured Logging**: Using metadata and context for rich log entries
- **Error Handling**: Logging exceptions and failures
- **Performance Monitoring**: Timing node execution
- **Runtime Integration**: Adding middleware to Flowcraft runtime

## Files

- `src/workflow.ts` - Workflow definitions demonstrating logging
- `src/main.ts` - Runtime setup with custom logging middleware
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Security Note

When implementing logging middleware in production:

- Be mindful of sensitive data in logs
- Use appropriate log levels (debug, info, warn, error)
- Consider log aggregation and monitoring systems
- Implement log rotation and retention policies

## Next Steps

After understanding custom middleware, explore:
- `middleware/db-transactions` - Database transaction middleware
- `reliability/error-handling` - Advanced error handling patterns
- `core-api/context-state-management` - Context manipulation techniques
