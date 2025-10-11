# Extending Flowcraft: Custom Loggers

Flowcraft includes a simple `ConsoleLogger` and a `NullLogger` (which does nothing). For production systems, you'll likely want to integrate with a more robust logging framework like Winston, Pino, or your cloud provider's logging service.

You can do this by creating a custom logger that implements the `ILogger` interface.

### The `ILogger` Interface

The `ILogger` interface defines four standard logging methods:

```typescript
interface ILogger {
	debug: (message: string, meta?: Record<string, any>) => void
	info: (message: string, meta?: Record<string, any>) => void
	warn: (message: string, meta?: Record<string, any>) => void
	error: (message: string, meta?: Record<string, any>) => void
}
```

-   `message`: The log message string.
-   `meta`: An optional object containing structured metadata (e.g., `nodeId`, `executionId`). The `FlowRuntime` automatically provides this where applicable.

### Example: A Simple File Logger

Here is an example of a custom logger that appends log messages to a file.

```typescript
import { appendFile } from 'node:fs/promises'
import { ILogger } from 'flowcraft'

class FileLogger implements ILogger {
	constructor(private filePath: string) {}

	private async log(level: string, message: string, meta?: Record<string, any>) {
		const timestamp = new Date().toISOString()
		const metaString = meta ? ` ${JSON.stringify(meta)}` : ''
		const logLine = `${timestamp} [${level.toUpperCase()}] ${message}${metaString}\n`
		await appendFile(this.filePath, logLine)
	}

	debug(message: string, meta?: Record<string, any>): void {
		this.log('debug', message, meta)
	}

	info(message: string, meta?: Record<string, any>): void {
		this.log('info', message, meta)
	}

	warn(message: string, meta?: Record<string, any>): void {
		this.log('warn', message, meta)
	}

	error(message: string, meta?: Record<string, any>): void {
		this.log('error', message, meta)
	}
}
```

### Using the Custom Logger

To use your custom logger, simply pass an instance of it to the `FlowRuntime` constructor.

```typescript
import { FlowRuntime } from 'flowcraft'
// ... other imports

const myLogger = new FileLogger('workflow.log')

const runtime = new FlowRuntime({
	logger: myLogger,
	// ... other options
})

// Now, all runtime and node-level logs will be written to 'workflow.log'.
await runtime.run(myBlueprint, {})
```
