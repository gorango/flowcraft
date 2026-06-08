---
name: workflow-analysis
description: Analyze, visualize, and inspect Flowcraft workflows. Covers static analysis (analyzeBlueprint, lintBlueprint, checkForCycles), Mermaid diagram generation, UI graph representation, and the CLI tool. Use when validating blueprints, generating diagrams, detecting cycles, or inspecting workflow executions.
---

# Workflow Analysis

Flowcraft provides tools to statically analyze, visualize, and inspect workflows before and after execution.

## Tools Overview

| Tool                | Purpose                                                       | See                                      |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| **Static Analysis** | Detect cycles, validate blueprints, find start/terminal nodes | [static-analysis.md](static-analysis.md) |
| **Visualization**   | Generate Mermaid diagrams, UI-friendly graph representations  | [visualization.md](visualization.md)     |
| **CLI**             | Inspect workflow executions from SQLite/PostgreSQL history    | [cli.md](cli.md)                         |

## Quick Examples

### Analyze a Blueprint

```typescript
import { analyzeBlueprint, createFlow } from 'flowcraft'

const flow = createFlow('my-flow')
	.node('A', async () => ({}))
	.node('B', async () => ({}))
	.edge('A', 'B')
	.toBlueprint()

const analysis = analyzeBlueprint(flow)
// {
//   cycles: [],
//   startNodeIds: ['A'],
//   terminalNodeIds: ['B'],
//   nodeCount: 2,
//   edgeCount: 1,
//   isDag: true
// }
```

### Generate a Diagram

```typescript
import { generateMermaid } from 'flowcraft'

const mermaidSyntax = generateMermaid(blueprint)
console.log(mermaidSyntax)
// flowchart TD
//   A["A"]
//   B["B"]
//   A --> B
```

### Lint a Blueprint

```typescript
import { lintBlueprint } from 'flowcraft'

const result = lintBlueprint(blueprint, registry)
if (!result.isValid) {
	for (const issue of result.issues) {
		console.log(`${issue.nodeId}: ${issue.message}`)
	}
}
```

## When to Use

- **Before running**: `lintBlueprint()` to catch structural issues
- **Debugging**: `generateMermaidForRun()` to see execution path with highlighting
- **CI/CD**: `analyzeBlueprint()` to enforce DAG constraints
- **Post-mortem**: `flowcraft inspect <run_id>` to examine completed executions
