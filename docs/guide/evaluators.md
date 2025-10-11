# Extending Flowcraft: Evaluators

Evaluators are responsible for executing the string expressions found in edge `condition` and `transform` properties. This allows for dynamic, data-driven control flow and data manipulation.

### The Default: `SimpleEvaluator`

Flowcraft ships with `SimpleEvaluator`, which uses `new Function()` to execute JavaScript expressions.

```typescript
// This condition is executed by the evaluator at runtime
flow.edge('A', 'B', { condition: 'result.output.status === \'SUCCESS\'' })
```

<div class="warning">
  <strong>Security Warning</strong><br>
  The default `SimpleEvaluator` is powerful but can be a security risk if the expressions in your `WorkflowBlueprint` are provided by untrusted users. It creates a sandbox, but a determined attacker could potentially escape it. For production systems handling user-defined workflows, it is **highly recommended** to replace it with a more secure, sandboxed library.
</div>

### Replacing the Evaluator

You can provide your own evaluator by creating a class that implements the `IEvaluator` interface and passing it to the `FlowRuntime`.

#### The `IEvaluator` Interface

```typescript
interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}
```
-   `expression`: The string to evaluate (e.g., `"result.output > 100"`).
-   `context`: A JavaScript object containing the data available to the expression (e.g., `result`, `context`).

#### Example: Using `jsep` for Safe AST-Based Evaluation

[jsep](https://www.npmjs.com/package/jsep) is a popular and secure JavaScript expression parser. It parses an expression into an Abstract Syntax Tree (AST) without executing it. You can then write a safe interpreter to walk the AST and evaluate it against your context.

Here is a conceptual example of how you might implement it:

```typescript
import { IEvaluator } from 'flowcraft'
import jsep from 'jsep'

// A simple, incomplete AST evaluator for demonstration.
// A real implementation would need to handle all expression types.
function evaluateAst(node: jsep.Expression, context: Record<string, any>): any {
	switch (node.type) {
		case 'Literal':
			return (node as jsep.Literal).value
		case 'Identifier':
			return context[(node as jsep.Identifier).name]
		case 'BinaryExpression':
			const binaryNode = node as jsep.BinaryExpression
			const left = evaluateAst(binaryNode.left, context)
			const right = evaluateAst(binaryNode.right, context)
			switch (binaryNode.operator) {
				case '===': return left === right
				case '>': return left > right
        // ... handle other operators
			}
			break
    // ... handle MemberExpression for `result.output`, etc.
	}
	throw new Error(`Unsupported expression type: ${node.type}`)
}

class JsepEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		try {
			const ast = jsep(expression)
			return evaluateAst(ast, context)
		}
		catch (error) {
			console.error(`Error evaluating expression with jsep: ${expression}`, error)
			return undefined // Return a falsy value on error
		}
	}
}

// Then, use it in the runtime:
const runtime = new FlowRuntime({
	evaluator: new JsepEvaluator(),
})
```

By implementing a custom evaluator, you gain full control over expression execution, enabling you to build secure and robust workflow systems.
