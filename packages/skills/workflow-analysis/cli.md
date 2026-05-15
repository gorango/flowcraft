# CLI Tool

The `@flowcraft/cli` package provides a command-line interface for workflow observability and debugging.

## Installation

```bash
npm install -g @flowcraft/cli
# or run with npx
npx @flowcraft/cli inspect <run_id>
```

## Inspect Workflow Executions

```bash
# SQLite backend
flowcraft inspect <run_id> --database ./workflow-events.db

# PostgreSQL backend
flowcraft inspect <run_id> \
  --host localhost \
  --port 5432 \
  --user flowcraft \
  --password password \
  --dbname flowcraft

# JSON output
flowcraft inspect <run_id> --database ./events.db --json
```

## Example Output

```
🚀 Workflow Execution Summary
─────────────────────────────────────────
Run ID: run_abc123
Blueprint: order-processing-workflow
Status: Completed

📊 Execution Statistics
─────────────────────────────
Total Events: 24
Nodes Started: 5
Nodes Completed: 5
Nodes Failed: 0

⏱️  Node Execution Timeline
───────────────────────────────────────
┌─────────────┬───────────┬──────────┐
│ Node ID     │ Status    │ Duration │
├─────────────┼───────────┼──────────┤
│ validate    │ Completed │ ~        │
│ process     │ Completed │ ~        │
│ ship        │ Completed │ ~        │
│ notify      │ Completed │ ~        │
│ complete    │ Completed │ ~        │
└─────────────┴───────────┴──────────┘

📋 Final Context
──────────────────
orderId: ORD-2024-001
status: shipped
trackingNumber: 1Z999AA1234567890
```

## Commands

### flowcraft inspect <run_id>

Displays:

- **Execution Summary**: Run ID, blueprint, status, error counts
- **Statistics**: Total events, node execution counts
- **Node Timeline**: Execution status and timing for each node
- **Final Context**: Key-value pairs from workflow's final state

#### Options

| Option                  | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `--database <path>`     | Path to SQLite database file                     |
| `--host <host>`         | PostgreSQL host                                  |
| `--port <port>`         | PostgreSQL port (default: 5432)                  |
| `--user <user>`         | PostgreSQL username                              |
| `--password <password>` | PostgreSQL password                              |
| `--dbname <dbname>`     | PostgreSQL database name                         |
| `--table <table>`       | History table name (default: 'flowcraft_events') |
| `--json`                | Output raw event data in JSON format             |

## Configuration

### 1. Command Line Options (highest precedence)

```bash
# SQLite
flowcraft inspect <run_id> --database ./workflow-events.db

# PostgreSQL
flowcraft inspect <run_id> --host localhost --port 5432 --user flowcraft --password password --dbname flowcraft
```

### 2. Environment Variables

```bash
# SQLite
export FLOWCRAFT_HISTORY_TYPE=sqlite
export FLOWCRAFT_SQLITE_PATH=./workflow-events.db

# PostgreSQL
export FLOWCRAFT_HISTORY_TYPE=postgres
export FLOWCRAFT_POSTGRES_HOST=localhost
export FLOWCRAFT_POSTGRES_PORT=5432
export FLOWCRAFT_POSTGRES_USER=flowcraft
export FLOWCRAFT_POSTGRES_PASSWORD=password
export FLOWCRAFT_POSTGRES_DB=flowcraft
export FLOWCRAFT_POSTGRES_TABLE=workflow_events
```

### 3. Configuration File

Create `.flowcraft.json` in project directory or `~/.flowcraft/config.json`:

```json
{
	"history": {
		"type": "sqlite",
		"sqlite": {
			"databasePath": "./workflow-events.db"
		}
	}
}
```

Or for PostgreSQL:

```json
{
	"history": {
		"type": "postgres",
		"postgres": {
			"host": "localhost",
			"port": 5432,
			"user": "flowcraft",
			"password": "password",
			"database": "flowcraft",
			"tableName": "workflow_events"
		}
	}
}
```

## Roadmap

- Track duration of workflow executions
- `flowcraft list`: List recent workflow executions
- `flowcraft reconcile <run_id>`: Trigger reconciliation for stuck workflows
- `flowcraft inspect --web`: Launch web UI for richer visualization
- `flowcraft compare <run_id-1> <run_id-2>`: Compare two workflow executions
