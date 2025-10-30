# Database Transaction Middleware Example

This example demonstrates database transaction management with automatic rollback on failures in Flowcraft.

## Overview

The example shows two scenarios:
1. **Successful Transaction**: Complete user insert/update with commit
2. **Failing Transaction**: Simulates database error with automatic rollback

## Features Demonstrated

- **Transaction Lifecycle**: Begin, operations, commit/rollback
- **Automatic Rollback**: Middleware handles failures and initiates rollbacks
- **Context Tracking**: Transaction IDs and operation state management
- **Error Propagation**: Proper error handling and logging
- **Middleware Integration**: Custom transaction middleware for database operations

## Running the Example

```bash
cd examples/middleware/db-transactions
pnpm install
pnpm start
```

## Expected Output

**Successful Transaction:**
- Begins transaction with unique ID
- Inserts user data
- Updates user data
- Commits transaction successfully

**Failing Transaction:**
- Begins transaction
- Inserts user data
- Simulates database constraint violation
- Middleware detects failure and initiates rollback

The middleware provides detailed logging for each database operation, showing how transactions are managed and rolled back on errors.