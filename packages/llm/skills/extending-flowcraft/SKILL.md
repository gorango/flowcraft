---
name: extending-flowcraft
description: Customize Flowcraft runtime behavior with pluggable components. Covers serializers, evaluators, loggers, and orchestrators. Use when the user needs custom serialization, complex data types, edge condition expressions, custom logging, or alternative execution strategies.
---

# Extending Flowcraft

The `FlowRuntime` can be configured with pluggable components to tailor behavior to specific needs.

## Extensibility Points

| Component        | Interface       | Purpose                                 | See                                  |
| ---------------- | --------------- | --------------------------------------- | ------------------------------------ |
| **Serializer**   | `ISerializer`   | Serialize/deserialize workflow context  | [serializers.md](serializers.md)     |
| **Evaluator**    | `IEvaluator`    | Evaluate edge conditions and transforms | [evaluators.md](evaluators.md)       |
| **Logger**       | `ILogger`       | Custom logging infrastructure           | [loggers.md](loggers.md)             |
| **Orchestrator** | `IOrchestrator` | Alternative execution strategies        | [orchestrators.md](orchestrators.md) |

## Quick Examples

### Custom Serializer

```typescript
import { ISerializer, FlowRuntime } from 'flowcraft'
import superjson from 'superjson'

class SuperJsonSerializer implements ISerializer {
	serialize(data: Record<string, any>): string {
		return superjson.stringify(data)
	}
	deserialize(text: string): Record<string, any> {
		return superjson.parse(text) as Record<string, any>
	}
}

const runtime = new FlowRuntime({ serializer: new SuperJsonSerializer() })
```

### Custom Evaluator

```typescript
import { IEvaluator, FlowRuntime } from 'flowcraft'
import jsep from 'jsep'

class JsepEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		const ast = jsep(expression)
		return interpretAst(ast, context) // Your AST interpreter
	}
}

const runtime = new FlowRuntime({ evaluator: new JsepEvaluator() })
```

### Custom Logger

```typescript
import { ILogger, FlowRuntime } from 'flowcraft'

class FileLogger implements ILogger {
	debug(msg: string, meta?: Record<string, any>) {
		/* ... */
	}
	info(msg: string, meta?: Record<string, any>) {
		/* ... */
	}
	warn(msg: string, meta?: Record<string, any>) {
		/* ... */
	}
	error(msg: string, meta?: Record<string, any>) {
		/* ... */
	}
}

const runtime = new FlowRuntime({ logger: new FileLogger('workflow.log') })
```

### Custom Orchestrator

```typescript
import { IOrchestrator, FlowRuntime, StepByStepOrchestrator } from 'flowcraft'

// Use step-by-step for debugging
const runtime = new FlowRuntime({
	orchestrator: new StepByStepOrchestrator(),
})
```

## Advanced topics

- **Serializers**: Handle complex types like Date, Map, Set — see [serializers.md](serializers.md)
- **Evaluators**: Property access vs full expressions — see [evaluators.md](evaluators.md)
- **Loggers**: Integrate with Winston, Pino, etc. — see [loggers.md](loggers.md)
- **Orchestrators**: Default, step-by-step, event-driven, resumption — see [orchestrators.md](orchestrators.md)
