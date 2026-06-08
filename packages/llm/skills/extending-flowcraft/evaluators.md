# Evaluators

Evaluators execute the string expressions found in edge `condition` and `transform` properties, enabling dynamic, data-driven control flow.

## The IEvaluator Interface

```typescript
interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}
```

- `expression`: The string to evaluate (e.g., `"result.output.status"`)
- `context`: Object containing available data (`result`, `context`)

## PropertyEvaluator (Default)

Secure property access for simple expressions:

```typescript
// PropertyEvaluator supports property access like 'result.output.status'
flow.edge('A', 'B', { condition: 'result.output.status' })
```

**Security:** High — only allows simple property access, cannot execute arbitrary code.

## UnsafeEvaluator

Full JavaScript support via `new Function()`:

```typescript
flow.edge('A', 'B', { condition: 'result.output > 100' })
```

**Security:** Low — can execute arbitrary JavaScript. Only use in trusted environments where all workflow definitions are authored by trusted developers.

## Custom Evaluator: jsep Example

For complex expressions with secure AST-based evaluation:

```typescript
import { IEvaluator } from 'flowcraft'
import jsep from 'jsep'

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
				case '===':
					return left === right
				case '>':
					return left > right
			}
			break
		// Handle MemberExpression for result.output, etc.
	}
	throw new Error(`Unsupported expression type: ${node.type}`)
}

class JsepEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		const ast = jsep(expression)
		return evaluateAst(ast, context)
	}
}

const runtime = new FlowRuntime({ evaluator: new JsepEvaluator() })
```

## Evaluator Comparison

| Evaluator           | Security     | Use Case                                  | Example Expression       |
| ------------------- | ------------ | ----------------------------------------- | ------------------------ |
| `PropertyEvaluator` | High         | Production, simple property access        | `'result.output.status'` |
| `UnsafeEvaluator`   | Low          | Trusted environments, complex expressions | `'result.output > 100'`  |
| Custom (`jsep`)     | Configurable | Advanced, secure needs                    | AST-based evaluation     |

## When to Choose

- **Production systems with untrusted blueprints**: Use `PropertyEvaluator`
- **Internal tools with trusted developers**: `UnsafeEvaluator` is convenient
- **Complex expressions with security requirements**: Custom `jsep`-based evaluator
