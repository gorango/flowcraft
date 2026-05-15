# Static Analysis

Statically analyze workflow blueprints before execution to catch errors, understand structure, and prevent runtime issues.

## analyzeBlueprint

The primary analysis tool. Returns a comprehensive `BlueprintAnalysis` object:

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
```

### BlueprintAnalysis Interface

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

| Field             | Description                                  |
| ----------------- | -------------------------------------------- |
| `cycles`          | Array of cyclic paths. Empty means valid DAG |
| `startNodeIds`    | Nodes with no incoming edges (entry points)  |
| `terminalNodeIds` | Nodes with no outgoing edges (exit points)   |
| `nodeCount`       | Total number of nodes                        |
| `edgeCount`       | Total number of edges                        |
| `isDag`           | `true` if no cycles detected                 |

## checkForCycles

Detects cyclic paths in a blueprint:

```typescript
import { checkForCycles } from 'flowcraft'

const cyclicBlueprint = {
	id: 'cyclic',
	nodes: [{ id: 'A' }, { id: 'B' }],
	edges: [
		{ source: 'A', target: 'B' },
		{ source: 'B', target: 'A' },
	],
}

const cycles = checkForCycles(cyclicBlueprint)
// Output: [['A', 'B', 'A']]
```

## lintBlueprint

Validates a blueprint against a function registry to find common errors:

```typescript
import { lintBlueprint } from 'flowcraft'

const blueprint = createFlow('lint-example')
	.node('A', async () => ({}))
	.edge('A', 'C') // Edge points to non-existent node
	.toBlueprint()

const registry = flow.getFunctionRegistry()
const result = lintBlueprint(blueprint, registry)

// {
//   isValid: false,
//   issues: [{
//     code: 'INVALID_EDGE_TARGET',
//     message: "Edge target 'C' does not correspond to a valid node ID.",
//     relatedId: 'A'
//   }]
// }
```

### Common Lint Error Codes

| Code                           | Meaning                                    |
| ------------------------------ | ------------------------------------------ |
| `MISSING_IMPLEMENTATION`       | Node `uses` key not in registry            |
| `ORPHAN_NODE`                  | Node has no incoming or outgoing edges     |
| `INVALID_EDGE_TARGET`          | Edge references non-existent node          |
| `UNREACHABLE_NODE`             | Node cannot be reached from any start node |
| `INVALID_BATCH_WORKER_KEY`     | Batch node references missing worker       |
| `INVALID_SUBFLOW_BLUEPRINT_ID` | Subflow references missing blueprint       |

### Dynamic Node Validations

The linter validates built-in node types:

- **Batch Nodes**: Checks `params.workerUsesKey` exists in registry
- **Subflow Nodes**: Checks `params.blueprintId` exists in blueprints registry

## Compile-Time Type Safety (Compiler)

When using the Flowcraft Compiler, TypeScript's type checker validates data flow between nodes:

```typescript
/** @flow */
export async function typeSafeWorkflow(input: string) {
	const parsed = await parseData(input) // string → ParsedData
	const validated = await validateData(parsed) // ParsedData → ValidatedData
	return validated
}

/** @step */
async function parseData(data: string): Promise<ParsedData> {
	/* ... */
}

/** @step */
async function validateData(data: ParsedData): Promise<ValidatedData> {
	/* ... */
}
```

Type mismatches are caught at compile time:

```typescript
/** @flow */
export async function invalidWorkflow() {
	const result = await parseData('input')
	const validated = await validateData('invalid') // ❌ Type error
	return validated
}
```
