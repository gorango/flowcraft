# Pluggable Logging

Effective logging is essential for debugging and monitoring any application. Flowcraft is designed to be completely unopinionated about your logging strategy. It provides a simple `Logger` interface and includes a few basic implementations, but makes it easy to plug in any logging library you prefer, such as **Pino**, **Winston**, or your company's standard logger.

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

The `context` object is used to pass structured data, which is a best practice for modern logging. The Flowcraft engine will automatically pass contextual information here, such as retry attempts or error details.

## Using the Built-in `ConsoleLogger`

Flowcraft comes with two pre-built loggers:

- **`ConsoleLogger`**: A straightforward logger that prints messages to the `console`. It supports log levels to control verbosity.
- **`NullLogger`**: A logger that does nothing.

> [!NOTE]
> **Flowcraft is silent by default.** The `NullLogger` is the framework's default if no logger is provided. This ensures that Flowcraft doesn't clutter your application's output unless you explicitly enable logging by passing a `logger` in the `RunOptions`.

To use the `ConsoleLogger`, simply pass it in the `RunOptions` when you execute a flow. You can specify a minimum log level (`'debug'`, `'info'`, `'warn'`, `'error'`) in its constructor.

```typescript
import { ConsoleLogger, Flow, Node, TypedContext } from 'flowcraft'

const myFlow = new Flow(new Node().exec(() => 'done'))
const context = new TypedContext()

// Default level is 'info'
const logger = new ConsoleLogger()
await myFlow.run(context, { logger })

// Enable verbose debug logging for deep tracing
const debugLogger = new ConsoleLogger({ level: 'debug' })
await myFlow.run(context, { logger: debugLogger })
```

### Understanding Log Levels

-   **`info` (Default)**: Provides a high-level overview of the workflow's execution. It logs when flows and nodes start, when a flow ends because an action has no successor, and important warnings or errors.
-   **`debug` (Verbose)**: Provides a detailed, step-by-step trace of the entire process. This is invaluable for debugging. Enabling it will show you:
    -   The exact `params` passed to each node.
    -   The result of each lifecycle phase (`prep` and `exec`).
    -   The specific `action` string returned by each node's `post()` method.
    -   The precise branching decisions made by the executor.
    -   Detailed steps of the `GraphBuilder`, including node instantiation and edge wiring.
    -   The sub-workflow inlining process.

## Integrating a Custom Logger (e.g., Pino)

Plugging in a production-grade logger like [Pino](https://github.com/pinojs/pino) is easy. All you need is a simple adapter class that maps Pino's logging methods to Flowcraft's `Logger` interface.

Because your Pino instance will have its own internal log level configuration, it will automatically filter messages from Flowcraft, giving you full control over the output in your production environment.

### Example: Pino Logger Adapter

First, install pino:

```bash
npm install pino
```

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
const pinoInstance = pino({ level: 'info' }) // or 'debug' for more verbosity

const pinoLogger = new PinoFlowcraftLogger(pinoInstance)

await myFlow.run(context, { logger: pinoLogger })
```
