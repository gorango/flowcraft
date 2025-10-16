# Evaluator

Evaluators execute the string expressions found in edge `condition` and `transform` properties.

## `IEvaluator` Interface

The interface that all custom evaluators must implement.

```typescript
interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}
```

-   **`expression`**: The string to evaluate (e.g., `"result.output.status"` for `PropertyEvaluator` or `"result.output > 100"` for `UnsafeEvaluator`).
-   **`context`**: A JavaScript object containing the data available to the expression (e.g., `result`, `context`).

## `PropertyEvaluator` Class

The **default** evaluator, which provides secure property access for simple expressions.

```typescript
import { PropertyEvaluator } from 'flowcraft'

const evaluator = new PropertyEvaluator()
const result = evaluator.evaluate('result.output.status', {
  result: { output: { status: 'OK' } }
})
// result === 'OK'
```

**Features:**
- **Secure by default**: Only allows simple property access (e.g., `result.output.status`)
- **No code execution**: Cannot run arbitrary JavaScript
- **Performance optimized**: Lightweight and fast for basic use cases

**Limitations:**
- Cannot use operators like `<`, `>`, `===`, `!==`, `+`, `*`, etc.
- Limited to dot-notation property access

## `UnsafeEvaluator` Class

An evaluator that uses `new Function()` to execute JavaScript expressions. **Not recommended for production use**.

```typescript
import { UnsafeEvaluator } from 'flowcraft'

const runtime = new FlowRuntime({
  evaluator: new UnsafeEvaluator(), // Explicit opt-in required
})
```

> [!CAUTION]
> **Remote Code Execution Risk**
>
> `UnsafeEvaluator` uses `new Function()` to execute code from blueprint strings. This poses a **severe security vulnerability** that can lead to Remote Code Execution (RCE) if workflow blueprints contain untrusted input.
>
> Never use `UnsafeEvaluator` in production systems where blueprints might be **defined by untrusted third parties**. It should only be used in controlled environments where all workflow definitions are static and authored by trusted developers.
>
> For complex expressions in production, implement a custom evaluator using a sandboxed library like [jsep](https://www.npmjs.com/package/jsep). See the [Custom Evaluators guide](/guide/evaluators) for an example.

**Features:**
- **Full JavaScript support**: Can evaluate complex expressions with operators, functions, etc.
- **Backward compatible**: Supports all expressions that worked with the previous `SimpleEvaluator`

**When to use:**
- Development and testing environments
- Internal tools where all blueprints are controlled
- Migration period while refactoring to use `PropertyEvaluator` or custom evaluators
