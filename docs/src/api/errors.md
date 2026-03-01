# Errors

Flowcraft uses a centralized error handling system to provide consistent and debuggable error information across the framework.

## `FlowcraftError`

The primary error class for all workflow-related failures. This class provides a unified structure for errors, using the standard `cause` property for chaining and rich metadata for debugging.

### Constructor

```typescript
new FlowcraftError(message: string, options?: {
  cause?: Error;
  nodeId?: string;
  blueprintId?: string;
  executionId?: string;
  isFatal?: boolean;
})
```

### Properties
-   **`nodeId?`** `string`: The ID of the node that failed (optional).
-   **`blueprintId?`** `string`: The ID of the blueprint being executed (optional).
-   **`executionId?`** `string`: The unique ID for the workflow run (optional).
-   **`isFatal`** `boolean`: Whether the error should halt the workflow immediately (default: `false`).
-   **`cause?`** `Error`: The underlying error that caused this failure (via standard Error chaining).

### Usage

```typescript
// Non-fatal error with cause
throw new FlowcraftError('Node execution failed', {
  cause: originalError,
  nodeId: 'my-node',
  blueprintId: 'my-blueprint',
  executionId: 'exec-123',
  isFatal: false,
});

// Fatal error
throw new FlowcraftError('Unrecoverable failure', {
  nodeId: 'critical-node',
  isFatal: true,
});
```

## Runtime Validation Errors

Flowcraft performs runtime validation on workflow blueprints and throws descriptive errors when misconfigurations are detected.

### Loop Controller Missing Continue Edge

When a loop controller node lacks a required continue edge, Flowcraft throws:

```typescript
throw new FlowcraftError(
  "Loop 'myLoop' has no continue edge to start node. " +
    "Ensure edges are wired inside the loop and incoming/breaking edges point to the loop controller.",
  { nodeId: 'myLoop', blueprintId: 'my-blueprint' }
);
```

This validation ensures loops are properly configured and prevents silent failures during execution.
