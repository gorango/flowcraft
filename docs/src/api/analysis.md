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

Analyzes a blueprint specifically to detect cyclic dependencies using an iterative depth-first search algorithm. This approach avoids stack overflow issues for deep graphs compared to recursive implementations. This function is used internally by [`analyzeBlueprint`](/api/analysis#analyzeblueprint-blueprint).

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The blueprint to check.
-   **Returns**: `string[][]` - An array of cycles found. Each cycle is an array of node IDs representing the path.

## `generateMermaid(blueprint)`

Generates Mermaid diagram syntax from a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The blueprint to visualize.
-   **Returns**: `string` - The Mermaid syntax for the flowchart.

## `generateMermaidForRun(blueprint, events)`

Generates Mermaid diagram syntax from a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) with execution history highlighting. This provides visual diagnostics for debugging and monitoring workflow runs.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The blueprint to visualize.
-   **`events`** [`FlowcraftEvent[]`](/api/types#flowcraftevent): Array of events from the workflow execution.
-   **Returns**: `string` - The Mermaid syntax for the flowchart with execution path styling.
