# Fallback Strategies Example

This example demonstrates cascading and parallel fallback strategies for resilient service calls in Flowcraft.

## Overview

The example shows two fallback patterns:
1. **Cascading Fallback**: Try services in sequence until one succeeds
2. **Parallel Fallback**: Run multiple services concurrently and use the first success

## Features Demonstrated

- **Service Degradation**: Simulated service failures with different reliability rates
- **Cascading Logic**: Sequential fallback with middleware-controlled execution
- **Parallel Execution**: Concurrent service attempts for faster recovery
- **Context Management**: Tracking which service ultimately provided the response
- **Performance Trade-offs**: Balancing speed vs. reliability in fallback strategies

## Running the Example

```bash
cd examples/reliability/fallback-strategies
pnpm install
pnpm start
```

## Expected Output

**Cascading Fallback:**
- Attempts primary service first (50% success rate)
- Falls back to secondary (80% success rate, 300ms delay) if primary fails
- Falls back to tertiary (90% success rate, 500ms delay) if secondary fails
- Shows which service ultimately succeeded

**Parallel Fallback:**
- Runs primary and secondary services simultaneously
- Uses whichever completes first successfully
- Demonstrates faster recovery through parallelism

The middleware provides detailed logging of fallback attempts, service failures, and successful recoveries.