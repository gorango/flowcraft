# Static Analysis Diagrams Example

This example demonstrates static analysis and ASCII diagram generation for Flowcraft workflows.

## Overview

The workflow performs static analysis on workflow blueprints:
1. Analyzes structural properties (nodes, edges, connectivity)
2. Generates ASCII diagrams showing workflow topology
3. Validates the generated diagrams

## Features Demonstrated

- **Structural Analysis**: Counting nodes, edges, and connectivity metrics
- **ASCII Diagram Generation**: Creating visual representations of workflows
- **Workflow Introspection**: Analyzing blueprint metadata
- **Validation**: Ensuring generated artifacts meet quality standards
- **Static Analysis Middleware**: Tools for analyzing workflows without execution

## Running the Example

```bash
cd examples/tooling/static-analysis-diagrams
pnpm install
pnpm start
```

## Expected Output

The example analyzes its own workflow structure and generates an ASCII diagram:

- **Analysis**: Counts total nodes, edges, connected vs isolated nodes
- **Diagram**: ASCII representation showing node connections and flow
- **Statistics**: Summary of workflow complexity metrics

Demonstrates how static analysis tools can provide insights into workflow design and generate documentation.