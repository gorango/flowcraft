# Loggers

Flowcraft includes `ConsoleLogger` and `NullLogger`. For production, integrate with Winston, Pino, or cloud logging services via the `ILogger` interface.

## The ILogger Interface

```typescript
interface ILogger {
	debug: (message: string, meta?: Record<string, any>) => void
	info: (message: string, meta?: Record<string, any>) => void
	warn: (message: string, meta?: Record<string, any>) => void
	error: (message: string, meta?: Record<string, any>) => void
}
```

- `message`: The log message string
- `meta`: Optional structured metadata (e.g., `nodeId`, `executionId`). The runtime provides this automatically.

## Example: File Logger

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

### Usage

```typescript
const myLogger = new FileLogger('workflow.log')

const runtime = new FlowRuntime({
	logger: myLogger,
})

await runtime.run(myBlueprint, {})
// All runtime and node-level logs written to 'workflow.log'
```

## Integration Examples

### Winston

```typescript
import winston from 'winston'
import { ILogger } from 'flowcraft'

class WinstonLogger implements ILogger {
	private logger = winston.createLogger({
		level: 'info',
		format: winston.format.json(),
		transports: [new winston.transports.Console()],
	})

	debug(message: string, meta?: Record<string, any>) {
		this.logger.debug(message, meta)
	}
	info(message: string, meta?: Record<string, any>) {
		this.logger.info(message, meta)
	}
	warn(message: string, meta?: Record<string, any>) {
		this.logger.warn(message, meta)
	}
	error(message: string, meta?: Record<string, any>) {
		this.logger.error(message, meta)
	}
}
```

### Pino

```typescript
import pino from 'pino'
import { ILogger } from 'flowcraft'

class PinoLogger implements ILogger {
	private logger = pino()

	debug(message: string, meta?: Record<string, any>) {
		this.logger.debug(meta, message)
	}
	info(message: string, meta?: Record<string, any>) {
		this.logger.info(meta, message)
	}
	warn(message: string, meta?: Record<string, any>) {
		this.logger.warn(meta, message)
	}
	error(message: string, meta?: Record<string, any>) {
		this.logger.error(meta, message)
	}
}
```

## Built-in Loggers

| Logger          | Behavior                        |
| --------------- | ------------------------------- |
| `ConsoleLogger` | Logs to console (default)       |
| `NullLogger`    | Discards all logs (silent mode) |
