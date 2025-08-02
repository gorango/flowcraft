# Pluggable Logging & Detailed Tracing

Effective logging is essential for debugging and monitoring any application. Flowcraft is designed to be completely unopinionated about your logging strategy. The core framework is **silent by default** and only logs critical warnings (like for retries) or errors.

To get a detailed, step-by-step trace of a workflow's execution, you can use the powerful **middleware** system to "opt-in" to verbose logging. This guide shows you how.

## The `Logger` Interface

The framework uses a simple interface to decouple itself from any specific logging implementation. Any logger you provide must conform to this shape:

```typescript
export interface Logger {
	debug: (message: string, context?: object) => void
	info: (message: string, context?: object) => void
	warn: (message: string, context?: object) => void
	error: (message: string, context?: object) => void
}
```

The `context` object is used to pass structured data, which is a best practice for modern logging.

## Using the Built-in `ConsoleLogger`

Flowcraft comes with two pre-built loggers:

- **`ConsoleLogger`**: A straightforward logger that prints messages to the `console`. It supports log levels to control verbosity.
- **`NullLogger`**: A logger that does nothing. This is the framework's default, ensuring it doesn't clutter your application's output unless you explicitly enable logging.

To use the `ConsoleLogger`, simply pass it in the `RunOptions` when you execute a flow.

```typescript
import { ConsoleLogger, Flow, Node, TypedContext } from 'flowcraft'

const myFlow = new Flow(new Node())
const context = new TypedContext()

// Use a logger with the default 'info' level
const logger = new ConsoleLogger()
await myFlow.run(context, { logger })

// Enable verbose debug logging
const debugLogger = new ConsoleLogger({ level: 'debug' })
```

## How to Get Detailed Tracing with Middleware

To see the inner workings of your flow—which nodes are running, what data they receive, and which branches they take—you should apply a logging middleware. This gives you full control over the log format and content.

### A Reusable Logging Middleware

Here is an example of a comprehensive logging middleware that you can add to your own projects. It logs the entry and exit of each node and provides details about branching decisions.

```typescript
// src/middleware/logging.ts
import { Middleware, MiddlewareNext, NodeArgs, DEFAULT_ACTION } from 'flowcraft'

// Helper to get a clean display name for an action
function getActionDisplay(action: any): string {
    if (typeof action === 'symbol') {
        return action.description ?? 'symbol';
    }
    return String(action);
}

// The Logging Middleware
export const loggingMiddleware: Middleware = async (args: NodeArgs, next: MiddlewareNext) => {
    const { logger, name: nodeName, params, node } = args;

    // 1. Log node entry
    logger.debug(`[Workflow] > Starting node '${nodeName}'`, { params });

    // 2. Execute the node
    const action = await next(args);

    // 3. Log node exit and branching
    if (node) {
        const nextNode = node.successors.get(action);
        const actionDisplay = getActionDisplay(action);

        if (nextNode) {
            logger.debug(
                `[Workflow] < Node '${nodeName}' completed with action '${actionDisplay}', proceeding to '${nextNode.constructor.name}'.`
            );
        } else if (action !== undefined && action !== null) {
            logger.debug(
                `[Workflow] < Node '${nodeName}' completed with terminal action '${actionDisplay}'. Flow ends.`
            );
        } else {
             logger.debug(`[Workflow] < Node '${nodeName}' completed.`);
        }
    }

    return action;
};
```

### Applying the Middleware

To use it, import your middleware and apply it to your `Flow` instance with `.use()`.

```typescript
import { ConsoleLogger, Flow } from 'flowcraft'
import { loggingMiddleware } from './middleware/logging'

const myFlow = createComplexFlow()

// Apply the middleware to the flow
myFlow.use(loggingMiddleware)

// Run the flow with a debug-level logger to see the detailed output
await myFlow.run(context, { logger: new ConsoleLogger({ level: 'debug' }) })
```

This pattern provides the best of both worlds: a silent-by-default core and the ability to get rich, structured, and fully customizable diagnostic logs on demand.

## Integrating a Custom Logger (e.g., Pino)

Plugging in a production-grade logger like [Pino](https://github.com/pinojs/pino) is easy. All you need is a simple adapter class that maps Pino's logging methods to Flowcraft's `Logger` interface.

### Example: Pino Logger Adapter

First, install pino: `npm install pino`

Then, create an adapter class:

```typescript
// src/loggers/pino-logger.ts
import { Logger as FlowcraftLogger } from 'flowcraft'
import pino, { Logger as PinoLogger } from 'pino'

export class PinoFlowcraftLogger implements FlowcraftLogger {
	private pino: PinoLogger

	constructor(pinoInstance: PinoLogger) {
		// The user provides their own pre-configured pino instance.
		// Flowcraft will call .debug(), .info(), etc., and pino
		// will decide whether to print them based on its own level.
		this.pino = pinoInstance
	}

	public debug(message: string, context?: object): void {
		this.pino.debug(context || {}, message)
	}

	public info(message: string, context?: object): void {
		this.pino.info(context || {}, message)
	}

	public warn(message: string, context?: object): void {
		this.pino.warn(context || {}, message)
	}

	public error(message: string, context?: object): void {
		this.pino.error(context || {}, message)
	}
}
```

Now you can use your custom logger:

```typescript
import pino from 'pino'
// main.ts
import { PinoFlowcraftLogger } from './loggers/pino-logger'

// The user configures pino as they normally would.
const pinoInstance = pino({ level: 'info' })

const pinoLogger = new PinoFlowcraftLogger(pinoInstance)

await myFlow.run(context, { logger: pinoLogger })
```
