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
> **Security Warning: Potential for Code Injection**
>
> `SimpleEvaluator` uses `new Function()` to execute code from blueprint strings. While it operates in a limited scope, it is a potential security vulnerability if your workflow blueprints can be defined by untrusted third parties.
>
> For production systems with external blueprint sources, it is strongly recommended to replace this with a secure, sandboxed implementation like [jsep](https://www.npmjs.com/package/jsep). See the [Custom Evaluators guide](/guide/evaluators) for an example.
