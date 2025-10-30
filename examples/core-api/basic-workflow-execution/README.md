# Basic Workflow Execution

This example demonstrates the fundamental concepts of creating and executing workflows with Flowcraft. It shows how to build a simple sequential workflow that processes user data through multiple steps.

## Overview

The example creates a user processing workflow that:
1. **Validates** user input data
2. **Processes** the user information
3. **Sends** a welcome notification

This demonstrates the core Flowcraft concepts:
- Creating workflows with `createFlow()`
- Defining nodes with business logic
- Connecting nodes with edges
- Executing workflows with `FlowRuntime`
- Passing data through context

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## What You'll Learn

### 1. Workflow Creation
```typescript
import { createFlow } from 'flowcraft'

const workflow = createFlow('user-processing-workflow')
  .node('validateUser', async ({ context }) => {
    // Node logic here
  })
  .edge('validateUser', 'processUser')
```

### 2. Node Definition
Nodes are asynchronous functions that receive context and return results:

```typescript
.node('validateUser', async ({ context }) => {
  const user = await context.get('user')
  // Validation logic...
  return { output: 'User validated successfully' }
})
```

### 3. Context Management
Context stores workflow data and persists across node executions:

```typescript
// Read from context
const user = await context.get('user')

// Write to context
await context.set('processedUser', processedData)
```

### 4. Runtime Execution
```typescript
const runtime = new FlowRuntime({
  logger: new ConsoleLogger(),
})

const result = await runtime.run(blueprint, initialContext, {
  functionRegistry: workflow.getFunctionRegistry(),
})
```

## Expected Output

```
🚀 Flowcraft Basic Workflow Execution Example

📋 Workflow Blueprint:
   Name: user-processing-workflow
   Nodes: 3
   Edges: 2

👤 Input User Data:
{
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "age": 28
}

▶️  Starting workflow execution...

🔍 Validating user data...
✅ User Alice Johnson validated
⚙️ Processing user...
✅ User Alice Johnson processed
📧 Sending notification...
📧 Notification sent to alice@example.com: "Welcome Alice Johnson!"

✅ Workflow completed successfully!

📊 Execution Results:
   Status: completed
   Execution ID: run_abc123...

📋 Final Context:
{
  "user": {
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "age": 28
  },
  "processedUser": {
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "age": 28,
    "processedAt": "2024-01-15T10:30:00.000Z",
    "status": "processed"
  }
}
```

## Key Concepts Demonstrated

- **Sequential Execution**: Nodes run in the order defined by edges
- **Data Flow**: Information passes between nodes through context
- **Error Handling**: Workflows fail gracefully on errors
- **Logging**: Built-in logging shows execution progress
- **Type Safety**: Full TypeScript support throughout

## Files

- `src/workflow.ts` - Workflow definition with nodes and edges
- `src/main.ts` - Runtime setup and execution
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Next Steps

After understanding this basic example, explore:
- `function-class-nodes` - Different ways to define node logic
- `context-state-management` - Advanced context manipulation
- `built-in-nodes` - Flowcraft's built-in node types
