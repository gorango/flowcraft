# Compiler Usage Example

This example demonstrates how to use Flowcraft's compiler for workflow analysis and code generation.

## Overview

The workflow simulates a compiler pipeline that:
1. Analyzes workflow structure and metadata
2. Validates node implementations
3. Generates optimized code from the workflow blueprint

## Features Demonstrated

- **Workflow Analysis**: Extracting structural information from workflow blueprints
- **Node Validation**: Checking workflow configuration for correctness
- **Code Generation**: Creating optimized code representations
- **Compiler Middleware**: Custom processing pipeline for workflow compilation
- **Blueprint Inspection**: Working with serialized workflow definitions

## Running the Example

```bash
cd examples/tooling/compiler-usage
pnpm install
pnpm start
```

## Expected Output

The example analyzes its own workflow structure:

- **Analysis Phase**: Counts nodes and edges in the workflow
- **Validation Phase**: Ensures all nodes have proper configuration
- **Code Generation**: Produces a code template with workflow statistics

Shows how compiler tools can introspect and transform workflow definitions into other representations.