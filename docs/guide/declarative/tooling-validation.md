# Tooling & Validation

When you work with declarative workflows, especially those that are composed of sub-workflows, it's crucial to have tools to inspect and validate their structure *before* execution. Flowcraft provides powerful utilities for visualizing and validating your `WorkflowGraph` definitions.

## 1. Visualizing the Flattened Graph

The `GraphBuilder` can automatically generate and log a detailed [Mermaid.js](https://mermaid.js.org/) diagram of the final, **flattened graph**. This is an invaluable tool for debugging, as it shows you the exact structure the `Executor` will run, including:

-   Inlined sub-workflows with their namespaced IDs.
-   Automatically injected `InputMappingNode` and `OutputMappingNode`.
-   Generated `ParallelFlow` blocks for fan-out/fan-in patterns.
-   Injected `ConditionalJoinNode`s for unifying branches.

To see the graph, simply pass `true` as the second argument to the `.build()` or `buildBlueprint()` method. The diagram will be logged at the `info` level, so ensure your logger is configured to show it.

```typescript
import { ConsoleLogger, GraphBuilder } from 'flowcraft'

// Assume `nodeRegistry` and `myComplexGraph` are defined

// Instantiate the builder WITH a logger to see the output
const builder = new GraphBuilder(
	nodeRegistry,
	{ /* dependencies */ },
	{ /* options */ },
	new ConsoleLogger({ level: 'info' }) // <-- Ensure 'info' level is visible
)

// Pass `true` to log the final graph.
const { blueprint } = builder.buildBlueprint(myComplexGraph, true)
```

**Example Log Output**:
The builder will log a complete Mermaid diagram. You can paste this into any compatible renderer (like the one in VS Code or GitHub) to see a visual representation of your entire executable workflow.

```
[INFO] [GraphBuilder] Flattened Graph
[INFO] graph TD
[INFO]   subworkflow_input_mapper_0(("Inputs"))
[INFO]   subworkflow_add_10_0["add-10 (add)"]
[INFO]   ... and so on ...
```

## 2. Static Graph Validation

Flowcraft provides a powerful, lightweight utility library for performing static analysis on your `WorkflowGraph` definitions. This allows you to catch structural errors like cycles or incorrect connections before they cause runtime issues.

### The `analyzeGraph` Utility

The `analyzeGraph` function is the foundation of the validation library. It takes a `WorkflowGraph` object and returns a rich `GraphAnalysis` object containing metadata about the graph's structure, such as node connection degrees (`inDegree`, `outDegree`) and a list of any cycles.

### Writing Validation Rules

You can use the `createNodeRule` factory to build a set of custom validation rules for your application.

**Example Scenario**: Our application requires that:
1.  All graphs must be acyclic (no loops).
2.  Nodes of type `output` must be terminal (have no outgoing connections).

```typescript
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
	createNodeRule(
		node => node.type === 'output',
		(node) => {
			if (node.outDegree > 0) {
				return {
					type: 'ConnectionRuleViolation',
					nodeId: node.id,
					message: `Output node '${node.id}' cannot have outgoing connections.`
				}
			}
			return null
		}
	),
]

/**
 * The main validation function for our application.
 */
function validateMyWorkflow(graph: TypedWorkflowGraph<any>): { isValid: boolean, errors: ValidationError[] } {
	const analysis = analyzeGraph(graph)
	// Apply every rule in the ruleset to the graph analysis
	const errors = myRules.flatMap(rule => rule(analysis, graph))

	return {
		isValid: errors.length === 0,
		errors,
	}
}

// --- 2. Use the validator ---
const { isValid, errors } = validateMyWorkflow(myGraphDefinition)
if (!isValid) {
	console.error('Workflow validation failed:', errors)
}
```

### Type-Safe Validation

The validation utilities are fully integrated with Flowcraft's type system. By defining a `NodeTypeMap` for your application, you can write validation rules that are aware of the specific `data` payload of each node type, giving you compile-time safety and autocompletion.

**Example**: Ensure all our `api-call` nodes have a valid `retries` property in their data.

```typescript
import { createNodeRule, TypedGraphNode } from 'flowcraft'

// 1. Define your application's specific node types
interface MyAppNodeTypeMap {
	'api-call': { url: string, retries: number }
}

// 2. Create a rule that inspects the typed `data` property
const ruleApiRetries = createNodeRule<MyAppNodeTypeMap>(
	node => node.type === 'api-call',
	(node) => {
		// Note: A type assertion is needed here due to a current TypeScript limitation.
		const apiNode = node as TypedGraphNode<MyAppNodeTypeMap> & { type: 'api-call' }

		if (apiNode.data.retries < 1) {
			return {
				type: 'DataValidation',
				nodeId: node.id,
				message: `API call node '${node.id}' must have at least 1 retry.`
			}
		}
		return null // The node is valid
	}
)
```
