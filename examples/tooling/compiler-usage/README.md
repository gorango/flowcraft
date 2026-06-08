# Compiler Usage Example

This example demonstrates how to use Flowcraft's `@flowcraft/compiler` to transform imperative TypeScript code into declarative workflow blueprints.

## Overview

The `@flowcraft/compiler` allows you to write workflows using familiar imperative constructs like `if/else`, loops, and `Promise.all`, while automatically generating optimized workflow graphs. This gives you the best of both worlds: natural developer experience and powerful, serializable execution models.

## What This Example Does

1. **Defines Step Functions**: Atomic operations marked with `/** @step */` JSDoc tags
2. **Creates Multiple Flow Functions**: Various workflow patterns including parallel execution, sleep, event waiting, and subflows
3. **Compiles the Code**: Uses `compileProject()` to transform the imperative code into blueprints
4. **Loads Functions**: Dynamically imports step functions using the compiled registry
5. **Executes Multiple Workflows**: Runs different generated blueprints using FlowRuntime to demonstrate various features

## Features Demonstrated

- **Step Functions**: Simple parameter-based functions for workflow operations
- **Parallel Execution**: `Promise.all` creates concurrent branches in the workflow graph
- **Sequential Processing**: Results from parallel steps are aggregated sequentially
- **Durable Primitives**: `sleep()` and `waitForEvent()` from 'flowcraft/sdk'
- **Subflows**: Nested workflow execution with blueprint composition
- **Blueprint Generation**: Automatic transformation to workflow graphs
- **Dynamic Function Loading**: Leveraging compiled registry to import functions at runtime
- **Runtime Execution**: Using compiled blueprints with FlowRuntime

## Running the Example

```bash
cd examples/tooling/compiler-usage
pnpm install
pnpm start
```

## Expected Output

The example will:

1. Compile the TypeScript workflow code into blueprints
2. Display compilation statistics (blueprints and functions found)
3. Dynamically load the step functions from the compiled registry
4. Execute multiple workflows demonstrating different features:
   - **Parallel Flow**: Concurrent data fetching with `Promise.all`
   - **Sleep Flow**: Simulated sleep operation
   - **Subflow Example**: Nested workflow execution
   - **Wait Flow**: Simulated event waiting
5. Show step execution logs and completion status with timing for each workflow

## Key Concepts

- **`/** @step \*/`\*\*: Marks functions as workflow step operations
- **`/** @flow \*/`\*\*: Marks functions to be compiled into workflow blueprints
- **Promise.all Support**: Compiler transforms parallel execution into graph branches
- **Durable Primitives**: SDK functions for sleep, events, and webhooks
- **Subflows**: Composable workflow blueprints for complex orchestration
- **Compiled Registry**: Metadata for dynamic function loading at runtime
- **Blueprint Execution**: Serializable graphs executed by FlowRuntime
