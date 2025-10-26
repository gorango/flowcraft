# Evaluators

Evaluators are responsible for executing the string expressions found in edge `condition` and `transform` properties. This allows for dynamic, data-driven control flow and data manipulation.

## `PropertyEvaluator`

Flowcraft ships with `PropertyEvaluator`, which provides secure property access for simple expressions.

```typescript
// This condition is executed by the evaluator at runtime
// Note: PropertyEvaluator supports property access like 'result.output.status'
// For operators like ===, use UnsafeEvaluator or a custom evaluator
flow.edge('A', 'B', { condition: 'result.output.status' })
```

> [!TIP]
>
> The default `PropertyEvaluator` is secure but it only allows simple property access and cannot execute arbitrary code.
>
> In controlled enviroments, you can use the `UnsafeEvaluator` or implement a custom evaluator like the `jsep` example below.

## `UnsafeEvaluator`

For complex expressions with full JavaScript support, use [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class). However, it uses `new Function()` and poses a potential security risk. See the [Evaluator API docs](/api/evaluator) for details. Only use in controlled environments.

By implementing a custom evaluator, you gain full control over expression execution, enabling you to build robust workflow systems.

> [!WARNING]
> [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class) uses `new Function()` and can execute arbitrary JavaScript code. Only use it in trusted environments where all workflow definitions are authored by trusted developers. For production systems, consider implementing a custom evaluator using a sandboxed library like [`jsep`](https://npmjs.com/package/jsep).

## Extending the Evaluator

You can provide your own evaluator by creating a class that implements the `IEvaluator` interface and passing it to the [`FlowRuntime`](/api/runtime#flowruntime-class). For simple use cases, the built-in `PropertyEvaluator` is sufficient and secure.

#### The `IEvaluator` Interface

```typescript
interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}
```
-   `expression`: The string to evaluate (e.g., `"result.output.status"` for `PropertyEvaluator` or `"result.output > 100"` for `UnsafeEvaluator`).
-   `context`: A JavaScript object containing the data available to the expression (e.g., `result`, `context`).

#### Example: Using `jsep` for Safe AST-Based Evaluation

[jsep](https://www.npmjs.com/package/jsep) is a popular and secure JavaScript expression parser. It parses an expression into an Abstract Syntax Tree (AST) without executing it. You can then write a safe interpreter to walk the AST and evaluate it against your context. This is an alternative to `PropertyEvaluator` for more complex needs.

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

## Evaluator Comparison

| Evaluator | Security | Use Case | Example Expression |
|-----------|----------|----------|-------------------|
| [`PropertyEvaluator`](/api/evaluator#propertyevaluator-class) | High | Production, simple property access | `'result.output.status'` |
| [`UnsafeEvaluator`](/api/evaluator#unsafeevaluator-class) | Low | Trusted environments, complex expressions | `'result.output > 100'` |
| Custom (`jsep`) | Configurable | Advanced, secure needs | AST-based evaluation |
