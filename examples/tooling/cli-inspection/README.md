# CLI Inspect Example

This example demonstrates how to set up persistent event storage for workflow executions using SQLite and inspect completed workflows using the Flowcraft CLI.

## Overview

The example runs a simple greeting workflow that:
1. Fetches a user
2. Extracts the user's name
3. Creates a personalized greeting

All workflow events are stored in a SQLite database, enabling post-execution analysis and debugging.

## Setup

```bash
pnpm install
```

## Running the Example

```bash
pnpm start
```

This will:
- Execute the workflow with persistent event storage
- Display the workflow results
- Show the execution ID for CLI inspection
- Provide the CLI commands to inspect the execution

## Inspecting with CLI

After running the workflow, use the Flowcraft CLI to inspect the execution:

### Option 1: Install CLI globally
```bash
npm install -g @flowcraft/cli
flowcraft inspect <execution-id> --database ./workflow-events.db
```

### Option 2: Use npx
```bash
npx @flowcraft/cli inspect <execution-id> --database ./workflow-events.db
```

Replace `<execution-id>` with the execution ID printed by the example (starts with `run_`).

## What You'll See

The CLI will display:
- **Execution Summary**: Run ID, blueprint, status
- **Statistics**: Total events, node execution counts
- **Node Timeline**: Execution status and timing for each node
- **Final Context**: Key-value pairs from the workflow's final state

## Configuration

The example uses SQLite for event storage, but you can also configure PostgreSQL:

```typescript
import { PostgresHistoryAdapter } from '@flowcraft/postgres-history'

const eventStore = new PostgresHistoryAdapter({
  host: 'localhost',
  port: 5432,
  database: 'flowcraft',
  user: 'flowcraft',
  password: 'password',
  tableName: 'workflow_events',
})
```
