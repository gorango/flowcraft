# Pluggable Logging

Effective logging is essential for debugging and monitoring any application. Cascade is designed to be completely unopinionated about your logging strategy. It provides a simple `Logger` interface and includes a few basic implementations, but makes it easy to plug in any logging library you prefer, such as **Pino**, **Winston**, or your company's standard logger.

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

The `context` object is used to pass structured data, which is a best practice for modern logging. The Cascade engine will automatically pass contextual information here, such as retry attempts or error details.

## Using the Built-in Loggers

Cascade comes with two pre-built loggers:

- **`ConsoleLogger`**: A straightforward logger that prints messages to the `console` (e.g., `console.info`, `console.warn`). This is great for development and debugging.
- **`NullLogger`**: A logger that does nothing.

> [!NOTE]
> **Cascade is silent by default.** The `NullLogger` is the framework's default if no logger is provided. This ensures that Cascade doesn't clutter your application's output unless you explicitly enable logging by passing a `logger` in the `RunOptions`.

To use the `ConsoleLogger`, simply pass it in the `RunOptions` when you execute a flow:

```typescript
import { Flow, Node, TypedContext, ConsoleLogger } from 'cascade'

const myFlow = new Flow(new Node().exec(() => 'done'))
const context = new TypedContext()

// Run the flow with the console logger enabled
await myFlow.run(context, { logger: new ConsoleLogger() })
```

This will produce detailed output about the flow's execution, including which nodes are running, what actions they return, and any warnings or errors.

## Integrating a Custom Logger (e.g., Pino)

Plugging in a production-grade logger like [Pino](https://github.com/pinojs/pino) is easy. All you need is a simple adapter class that maps Pino's logging methods to Cascade's `Logger` interface.

### Example: Pino Logger Adapter

First, install pino:

```bash
npm install pino
```

Then, create an adapter class:

```typescript
// src/loggers/pino-logger.ts
import { Logger as CascadeLogger } from 'cascade'
import pino, { Logger as PinoLogger } from 'pino'

export class PinoCascadeLogger implements CascadeLogger {
  private pino: PinoLogger

  constructor(options?: pino.LoggerOptions) {
    // Initialize pino with your desired configuration
    this.pino = pino(options || {
      level: 'info',
      transport: {
        target: 'pino-pretty', // for development
      },
    })
  }

  // Map the interface methods to pino's methods
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

Now you can use your custom logger just like a built-in one:

```typescript
// main.ts
import { PinoCascadeLogger } from './loggers/pino-logger'

const pinoLogger = new PinoCascadeLogger()

await myFlow.run(context, { logger: pinoLogger })
```

Your workflow's execution logs will now be formatted as structured JSON (or pretty-printed, depending on your Pino configuration), ready to be shipped to a log aggregation service like Datadog, Logstash, or Splunk.
