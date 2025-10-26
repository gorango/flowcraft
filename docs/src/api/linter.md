# Linter

The linter statically analyzes a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) against a registry of implementations to find common errors before runtime.

## `lintBlueprint(blueprint, registry)`

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint to analyze.
-   **`registry`** `Map<string, NodeImplementation> | Record<string, NodeImplementation>`: A map or record of node implementations to check against.
-   **Returns**: `LinterResult`

### `LinterResult` Interface

```typescript
interface LinterResult {
	isValid: boolean
	issues: LinterIssue[]
}
```

### `LinterIssue` Interface

```typescript
interface LinterIssue {
	code: LinterIssueCode
	message: string
	nodeId?: string
	relatedId?: string
}
```

### `LinterIssueCode` Type

A string literal representing the type of issue found:
-   `'INVALID_EDGE_SOURCE'`: An edge's source ID does not exist.
-   `'INVALID_EDGE_TARGET'`: An edge's target ID does not exist.
-   `'MISSING_NODE_IMPLEMENTATION'`: A node's `uses` key is not in the registry.
-   `'ORPHAN_NODE'`: A node is not reachable from any start node.
-   `'INVALID_BATCH_WORKER_KEY'`: A batch node's `workerUsesKey` is not in the registry.
-   `'INVALID_SUBFLOW_BLUEPRINT_ID'`: A subflow node's `blueprintId` is not in the blueprints registry.
