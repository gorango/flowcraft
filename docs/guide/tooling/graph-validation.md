# Validating Workflows with Graph Analysis

As your workflows grow in complexity, it becomes crucial to ensure their structural integrity before they are ever executed. A graph with a cycle, an orphaned node, or an incorrect connection can lead to unexpected runtime behavior or infinite loops.

Flowcraft provides a powerful, lightweight, and **type-safe** utility library for performing static analysis and validation on your declarative `WorkflowGraph` definitions. This allows you to catch errors early, enforce best practices, and build more reliable systems.

## The `analyzeGraph` Utility

The foundation of the validation library is the `analyzeGraph` function. This is a pure, static utility that takes a `WorkflowGraph` object and returns a rich `GraphAnalysis` object containing pre-computed metadata about the graph's structure.

-   **`nodes`**: A map of all nodes, augmented with their `inDegree` and `outDegree`.
-   **`startNodeIds`**: An array of all node IDs with no incoming connections.
-   **`cycles`**: An array of any cycles found, where each cycle is an array of node IDs.

```typescript
import { analyzeGraph } from 'flowcraft'
import { myGraph } from './my-workflows'

const analysis = analyzeGraph(myGraph)
console.log('Start Nodes:', analysis.startNodeIds)
console.log('Cycles Found:', analysis.cycles.length)
```

## Writing Validation Rules

The real power comes from creating declarative validation rules that operate on this analysis data.

### `createNodeRule` Factory

This factory function is the primary tool for building custom validators. It takes three arguments:

1.  `description`: A string describing the rule for clear error messages.
2.  `filter`: A function that selects which nodes the rule should apply to (e.g., `node => node.type === 'output'`).
3.  `check`: A function that receives a selected node and returns whether it's valid.

### Built-in Validators

Flowcraft includes a pre-built validator for the most common and critical graph error:

-   `checkForCycles`: A validator that checks the analysis for any cycles and returns a `ValidationError` for each one found.

## Putting It All Together: A Custom Validator

Let's create a custom validation function for our application that enforces a set of rules.

**Example Scenario**: Our application requires that:
1.  All graphs must be acyclic (no loops).
2.  Nodes of type `output` must be terminal (have no outgoing connections).
3.  Nodes of type `condition` must have exactly one input.

```typescript
import type { MyAppNodeTypeMap } from './my-types' // Your application's node types
import {
	analyzeGraph,
	checkForCycles,
	createNodeRule,
	TypedWorkflowGraph,
	ValidationError
} from 'flowcraft'

// --- 1. Define the validation ruleset for our application ---
const myRules = [
	// Use the built-in cycle checker
	checkForCycles,

	// Rule: 'output' nodes must be terminal.
	createNodeRule<MyAppNodeTypeMap>(
		'Output must be terminal',
		node => node.type === 'output',
		node => ({
			valid: node.outDegree === 0,
			message: `Output node '${node.id}' cannot have outgoing connections.`
		})
	),

	// Rule: 'condition' nodes must have exactly one input.
	createNodeRule<MyAppNodeTypeMap>(
		'Condition needs one input',
		node => node.type === 'condition',
		node => ({
			valid: node.inDegree === 1,
			message: `Condition node '${node.id}' must have exactly one input, but has ${node.inDegree}.`
		})
	),
]

/**
 * The main validation function for our application.
 */
function validateMyWorkflow(graph: TypedWorkflowGraph<MyAppNodeTypeMap>): { isValid: boolean, errors: ValidationError[] } {
	const analysis = analyzeGraph(graph)
	// Apply every rule in the ruleset to the graph analysis
	const errors = myRules.flatMap(rule => rule(analysis, graph))

	return {
		isValid: errors.length === 0,
		errors,
	}
}
```

## Flexible API: Type-Safe vs. Untyped Validation

The validation utilities offer a flexible, overloaded API to accommodate different needs. You can work with strongly-typed graphs for maximum safety or use basic types for simplicity.

### 1. Type-Safe Validation (Recommended)

This is the most powerful way to use the library. By defining a `NodeTypeMap` and using `TypedWorkflowGraph`, you get full autocompletion and compile-time checking of your node types and their `data` payloads within your validation rules.

> [!TIP]
> The `createNodeRule` function is generic and integrates with `TypedWorkflowGraph`. This enables **compile-time type checking and autocompletion** even on the `data` property of your nodes.

**Example**: Let's ensure all our `api-call` nodes have a valid `retries` property.

```typescript
import { createNodeRule, isNodeType, TypedWorkflowGraph } from 'flowcraft'

// 1. Define your application's specific node types
interface MyAppNodeTypeMap {
	'api-call': { url: string, retries: number }
	'output': { destination: string }
}

// Your graph is strongly typed
const myGraph: TypedWorkflowGraph<MyAppNodeTypeMap> = { /* ... */ }

// 2. Use the `isNodeType` helper for a clean, readable filter
const rule_apiRetries = createNodeRule<MyAppNodeTypeMap>(
	'API calls must have retries',
	// The helper creates the type guard for you!
	isNodeType('api-call'),
	(node) => {
		// Because of the type guard, `node` is correctly narrowed.
		// `node.data.retries` is fully typed and autocompletes in your IDE!
		const valid = node.data.retries > 0
		return { valid, message: `API call '${node.id}' must have at least 1 retry.` }
	}
)
```

### 2. Untyped Validation (Flexible)

If you are working with a graph where the types are dynamic or you don't have a `NodeTypeMap` available, you can use the untyped version of the API. The functions will work with the base `WorkflowGraph` and `GraphNode` types.

```typescript
import { createNodeRule, WorkflowGraph } from 'flowcraft'

// The graph is of the basic, untyped shape
const myGraph: WorkflowGraph = { /* ... */ }

const rule_noOrphans = createNodeRule(
	'No orphaned nodes',
	// The `node` parameter is of the base `GraphNode` type
	_node => true, // Apply to all nodes
	node => ({
		valid: node.inDegree > 0 || node.outDegree > 0,
		message: `Node '${node.id}' has no connections.`
	})
)
```
