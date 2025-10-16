# Analysis

Flowcraft provides a set of utility functions for statically analyzing a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) before execution.

## `analyzeBlueprint(blueprint)`

Analyzes a workflow blueprint and returns a comprehensive analysis object.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint to analyze.
-   **Returns**: [`BlueprintAnalysis`](/api/analysis#blueprintanalysis-interface)

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

Analyzes a blueprint specifically to detect cyclic dependencies. This function is used internally by [`analyzeBlueprint`](/api/analysis#analyzeblueprint-blueprint).

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The blueprint to check.
-   **Returns**: `string[][]` - An array of cycles found. Each cycle is an array of node IDs representing the path.

## `generateMermaid(blueprint)`

Generates Mermaid diagram syntax from a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The blueprint to visualize.
-   **Returns**: `string` - The Mermaid syntax for the flowchart.
