# Retry Patterns Example

This example demonstrates different retry strategies for handling transient failures in Flowcraft workflows.

## Overview

The example showcases three retry patterns:
1. **Fixed Delay Retry**: Constant delay between retry attempts
2. **Exponential Backoff**: Increasing delays to reduce server load
3. **Circuit Breaker**: Fail-fast mechanism to prevent cascade failures

## Features Demonstrated

- **Retry Logic**: Configurable retry attempts with different delay strategies
- **Backoff Algorithms**: Fixed vs. exponential delay calculations
- **Circuit Breaker State**: Open/closed states with failure thresholds and timeouts
- **Failure Simulation**: Realistic service failure scenarios
- **Performance Impact**: Demonstrating how retry patterns affect execution time

## Running the Example

```bash
cd examples/reliability/retry-patterns
pnpm install
pnpm start
```

## Expected Output

**Fixed Delay Retry:**
- Retries failed operations with 200ms delays
- Shows consistent timing between retry attempts
- Demonstrates eventual success or permanent failure

**Exponential Backoff:**
- Delays increase exponentially (100ms, 200ms, 400ms)
- Reduces load on failing services over time
- Shows progressive delay increases

**Circuit Breaker:**
- Opens after 2 consecutive failures
- Fails fast for 2 seconds when open
- Automatically resets on success

The middleware provides detailed logging of retry attempts, delay calculations, and circuit breaker state changes.