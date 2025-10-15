# Analysis

Flowcraft provides a set of utility functions for statically analyzing a `WorkflowBlueprint` before execution.

## `analyzeBlueprint(blueprint)`

Analyzes a workflow blueprint and returns a comprehensive analysis object.

-   **`blueprint`** `WorkflowBlueprint`: The workflow blueprint to analyze.
-   **Returns**: `BlueprintAnalysis`

### `BlueprintAnalysis` Interface

```typescript
interface BlueprintAnalysis {
	cycles: string[][]
	startNodeIds: string[]
	terminalNodeIds: string[]
	nodeCount: number
	edgeCount: number
	isDag: boolean
}
```

## `checkForCycles(blueprint)`

Analyzes a blueprint specifically to detect cyclic dependencies. This function is used internally by `analyzeBlueprint`.

-   **`blueprint`** `WorkflowBlueprint`: The blueprint to check.
-   **Returns**: `string[][]` - An array of cycles found. Each cycle is an array of node IDs representing the path.

## `generateMermaid(blueprint)`

Generates Mermaid diagram syntax from a `WorkflowBlueprint`.

-   **`blueprint`** `WorkflowBlueprint`: The blueprint to visualize.
-   **Returns**: `string` - The Mermaid syntax for the flowchart.
