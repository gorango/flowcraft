# Static Analysis

Before you even run a workflow, Flowcraft provides tools to statically analyze its [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface). This can help you catch common errors, understand its structure, and prevent runtime issues.

## `analyzeBlueprint`

The [`analyzeBlueprint`](/api/analysis#analyzeblueprint-blueprint) function is the primary tool for static analysis. It takes a blueprint and returns a comprehensive [`BlueprintAnalysis`](/api/analysis#blueprintanalysis-interface) object.

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

## Detecting Cycles

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

The [`checkForCycles`](/api/analysis#checkforcycles-blueprint) function (which [`analyzeBlueprint`](/api/analysis#analyzeblueprint-blueprint) uses internally) returns an array of paths that form cycles.

## Linting a Blueprint

For even more detailed checks, you can use [`lintBlueprint`](/api/linter#lintblueprint-blueprint-registry). This function validates the blueprint against a function registry to find common errors like missing node implementations or broken edges. It also performs dynamic validations for built-in node types.

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

### Dynamic Node Validations

The linter also checks for issues specific to built-in node types:

- **Batch Nodes**: Validates that `params.workerUsesKey` exists in the registry for nodes with `uses` starting with `batch-`.
- **Subflow Nodes**: Validates that `params.blueprintId` exists in the blueprints registry for nodes with `uses: 'subflow'`.

```typescript
const blueprintWithIssues = createFlow('batch-example')
	.node('scatter', {
		uses: 'batch-scatter',
		params: {
			workerUsesKey: 'non-existent-worker' // This will trigger an error
		}
	})
	.node('subflow-node', {
		uses: 'subflow',
		params: {
			blueprintId: 'missing-blueprint' // This will trigger an error
		}
	})
	.toBlueprint()

const result = lintBlueprint(blueprintWithIssues, registry, blueprints)
console.log(result.issues)
// [
//   {
//     code: 'INVALID_BATCH_WORKER_KEY',
//     message: "Batch node 'scatter' references workerUsesKey 'non-existent-worker' which is not found in the registry.",
//     nodeId: 'scatter'
//   },
//   {
//     code: 'INVALID_SUBFLOW_BLUEPRINT_ID',
//     message: "Subflow node 'subflow-node' references blueprintId 'missing-blueprint' which is not found in the blueprints registry.",
//     nodeId: 'subflow-node'
//   }
// ]
```

## Compile-Time Type Safety

When using the Flowcraft Compiler, you get additional static analysis through TypeScript's type checker. The compiler validates data flow between nodes at compile time, catching type mismatches before runtime.

### Type Validation

The compiler uses TypeScript's TypeChecker to ensure that:

- Step function parameters match the expected types
- Return values from steps are compatible with subsequent usage
- Context keys are accessed with correct types

```typescript
/** @flow */
export async function typeSafeWorkflow(input: string) {
  const parsed = await parseData(input) // Expects string, returns ParsedData

  const validated = await validateData(parsed) // Expects ParsedData, returns ValidatedData

  return validated
}

/** @step */
async function parseData(data: string): Promise<ParsedData> {
  // Implementation
}

/** @step */
async function validateData(data: ParsedData): Promise<ValidatedData> {
  // Implementation
}
```

If you try to pass incompatible types, the compiler will report a type error:

```typescript
/** @flow */
export async function invalidWorkflow() {
  const result = await parseData("input")

  const validated = await validateData("invalid") // ❌ Type error: expected ParsedData, got string

  return validated
}
```

### Benefits

- **Early Error Detection**: Catch type mismatches during compilation, not at runtime
- **IDE Support**: Full IntelliSense and autocomplete for workflow development
- **Refactoring Safety**: TypeScript's refactoring tools work seamlessly with compiled workflows
- **Documentation**: Types serve as living documentation for your workflow interfaces

Using these analysis tools as part of your development or CI/CD process can significantly improve the reliability of your workflows.
