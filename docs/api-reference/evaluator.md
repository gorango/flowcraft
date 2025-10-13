# API: Evaluator

Evaluators execute the string expressions found in edge `condition` and `transform` properties.

## `IEvaluator` Interface

The interface that all custom evaluators must implement.

```typescript
interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}
```
-   **`expression`**: The string to evaluate (e.g., `"result.output > 100"`).
-   **`context`**: A JavaScript object containing the data available to the expression (e.g., `result`, `context`).

## `SimpleEvaluator` Class

The default evaluator, which uses `new Function()` to execute JavaScript expressions.

> [!CAUTION]
> **Security Risk**
>
> This class can execute arbitrary JavaScript code. Do not use it in production if your workflow blueprints can be defined by untrusted users. Replace it with a secure, sandboxed evaluator implementation.
