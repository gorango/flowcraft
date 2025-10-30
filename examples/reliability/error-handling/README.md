# Error Handling and Reliability Example

This example demonstrates retry mechanisms and error handling middleware in Flowcraft workflows.

## Overview

The example showcases two reliability patterns:
1. **Retry Mechanism**: Automatic retries for transient failures
2. **Error Handling**: Structured error processing and recovery

## Features Demonstrated

- **Retry Logic**: Configurable retry attempts with backoff delays
- **Failure Simulation**: Random and deterministic error scenarios
- **Error Propagation**: Proper error handling and logging
- **Middleware Composition**: Multiple middleware types for different concerns
- **Recovery Patterns**: Error handling workflows with recovery operations

## Running the Example

```bash
cd examples/reliability/error-handling
pnpm install
pnpm start
```

## Expected Output

**Retry Mechanism:**
- Runs 3 iterations of an unstable operation (70% failure rate)
- Shows retry attempts (up to 3) with 100ms delays between retries
- Demonstrates eventual success or permanent failure after max retries

**Error Handling:**
- Executes a workflow that always fails
- Shows error detection and handling by middleware
- Demonstrates error propagation and recovery attempts

The middleware provides detailed logging of retry attempts, error handling, and recovery operations.