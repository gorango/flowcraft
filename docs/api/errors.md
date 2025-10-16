# Errors

Flowcraft uses a set of custom error classes to handle specific failure scenarios during workflow execution.

## `NodeExecutionError`

The base error thrown when a node fails during execution after all retries have been exhausted.

### Properties
-   **`nodeId`** `string`: The ID of the node that failed.
-   **`blueprintId`** `string`: The ID of the blueprint being executed.
-   **`originalError?`** `Error`: The original error that caused the failure.
-   **`executionId?`** `string`: The unique ID for the workflow run.

## `FatalNodeExecutionError`

A subclass of `NodeExecutionError`. When this error is thrown from within a node's logic, the [`FlowRuntime`](/api/runtime#flowruntime-class) will immediately halt the workflow. It will **not** attempt any further retries or execute any configured fallbacks.

Use this for unrecoverable errors where continuing the workflow is impossible or unsafe.

## `CancelledWorkflowError`

This error is thrown when a workflow is gracefully stopped via an `AbortSignal`.
