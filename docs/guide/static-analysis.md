# Static Analysis

Before you even run a workflow, Flowcraft provides tools to statically analyze its `WorkflowBlueprint`. This can help you catch common errors, understand its structure, and prevent runtime issues.

### `analyzeBlueprint`

The `analyzeBlueprint` function is the primary tool for static analysis. It takes a blueprint and returns a comprehensive `BlueprintAnalysis` object.

```typescript
import { analyzeBlueprint, createFlow } from 'flowcraft'

const flow = createFlow('analysis-example')
	.node('A', async () => ({}))
	.node('B', async () => ({}))
	.node('C', async () => ({}))
	.edge('A', 'B')
	.edge('B', 'C')
	.toBlueprint()

const analysis = analyzeBlueprint(flow)
console.log(analysis)
```

The output will look like this:
```json
{
	"cycles": [],
	"startNodeIds": ["A"],
	"terminalNodeIds": ["C"],
	"nodeCount": 3,
	"edgeCount": 2,
	"isDag": true
}
```

This tells you:
-   **`cycles`**: An array of any cyclic paths found. An empty array means the graph is a valid Directed Acyclic Graph (DAG).
-   **`startNodeIds`**: The IDs of nodes that have no incoming edges. These are the entry points of your workflow.
-   **`terminalNodeIds`**: The IDs of nodes that have no outgoing edges. These are the exit points.
-   **`nodeCount`** and **`edgeCount`**: Total number of nodes and edges.
-   **`isDag`**: A boolean flag that is `true` if no cycles were detected.

### Detecting Cycles

Cycles in a workflow can lead to infinite loops. Flowcraft's runtime has safeguards, but it's best to detect them early.

Let's create a blueprint with a cycle:

```typescript
import { checkForCycles } from 'flowcraft'

const cyclicBlueprint = {
	id: 'cyclic',
	nodes: [{ id: 'A' }, { id: 'B' }],
	edges: [
		{ source: 'A', target: 'B' },
		{ source: 'B', target: 'A' }
	]
}

const cycles = checkForCycles(cyclicBlueprint)
console.log(cycles)
// Output: [['A', 'B', 'A']]
```

The `checkForCycles` function (which `analyzeBlueprint` uses internally) returns an array of paths that form cycles.

### Linting a Blueprint

For even more detailed checks, you can use `lintBlueprint`. This function validates the blueprint against a function registry to find common errors like missing node implementations or broken edges.

```typescript
import { lintBlueprint } from 'flowcraft'

const blueprint = createFlow('lint-example')
	.node('A', async () => ({}))
// Edge points to a node 'C' that doesn't exist.
	.edge('A', 'C')
	.toBlueprint()

const registry = flow.getFunctionRegistry()
const result = lintBlueprint(blueprint, registry)

console.log(result)
// {
//		isValid: false,
//		issues: [{
//			code: 'INVALID_EDGE_TARGET',
//			message: "Edge target 'C' does not correspond to a valid node ID.",
//			relatedId: 'A'
//		}]
// }
```

Using these analysis tools as part of your development or CI/CD process can significantly improve the reliability of your workflows.
