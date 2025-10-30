# Interactive Debugging Example

This example demonstrates step-through debugging capabilities for Flowcraft workflows.

## Overview

The workflow simulates an interactive debugging session that:
1. Initializes debug mode and step tracking
2. Processes steps with pause points
3. Checks conditions for continuation
4. Finalizes the debug session

## Features Demonstrated

- **Step-through Execution**: Pausing at each node for inspection
- **Context Inspection**: Viewing workflow state at each step
- **Execution Timing**: Measuring duration of each node
- **Error Tracing**: Detailed error reporting with stack traces
- **Debug Middleware**: Custom debugging pipeline with breakpoints

## Running the Example

```bash
cd examples/tooling/interactive-debugging
pnpm install
pnpm start
```

## Expected Output

The example runs a workflow with simulated interactive pauses:

- **Initialization**: Sets up debug mode and counters
- **Step Processing**: Increments step counter with each iteration
- **Condition Checking**: Determines when to stop (after 3 steps)
- **Finalization**: Reports total steps executed

Shows how debugging tools can provide detailed execution traces and interactive control over workflow execution.