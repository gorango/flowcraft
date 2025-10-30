# Performance Tuning Example

This example demonstrates performance monitoring and optimization suggestions in Flowcraft workflows.

## Overview

The workflow simulates a data processing pipeline with performance bottlenecks:
1. Loads data from an external source (simulated I/O delay)
2. Processes a batch of records (CPU intensive work)
3. Validates results
4. Generates a performance report

## Features Demonstrated

- **Performance Monitoring**: Middleware that tracks execution time for each node
- **Optimization Suggestions**: Automatic recommendations based on execution times
- **Benchmarking**: Multiple runs to gather performance metrics
- **Realistic Delays**: Simulated I/O and processing times
- **Context Management**: Efficient data passing between workflow steps

## Running the Example

```bash
cd examples/advanced/performance-tuning
pnpm install
pnpm start
```

## Expected Output

The example runs 3 iterations of the workflow, processing 1000 records each time:

- **Performance Metrics**: Each node shows execution time and performance rating
- **Optimization Hints**: Suggestions for slow operations (>80ms) and confirmation for fast ones (<10ms)
- **Results Summary**: Final report with record count and average processed values

The middleware provides real-time feedback on workflow performance, helping identify bottlenecks in complex workflows.