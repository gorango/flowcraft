# Context & State Management

This example demonstrates advanced patterns for managing workflow context and state in Flowcraft. Context is the primary mechanism for data flow between nodes and maintaining workflow state throughout execution.

## Overview

The example showcases three key areas:

1. **Basic Context Management** - Reading, writing, and transforming context data
2. **Advanced Context Patterns** - Nested structures and deep data access
3. **Context Persistence** - How context behaves across multiple executions

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## Context Fundamentals

### Reading from Context
```typescript
async function readData({ context }: any) {
  // Read initial input
  const input = await context.get('input')

  // Read workflow data
  const data = await context.get('workflowData')

  return { output: 'Data read' }
}
```

### Writing to Context
```typescript
async function processData({ context }: any) {
  const input = await context.get('input')

  // Transform data
  const processed = { ...input, processed: true }

  // Store result
  await context.set('processedData', processed)

  return { output: 'Data processed' }
}
```

### Conditional Context Access
```typescript
async function checkData({ context }: any) {
  const existing = await context.get('existingData')

  if (existing) {
    // Use existing data
    return { output: 'Using cached data' }
  } else {
    // Initialize new data
    await context.set('needsInit', true)
    return { output: 'Need initialization' }
  }
}
```

## Advanced Patterns

### Nested Data Structures
```typescript
// Create complex nested objects
const nestedData = {
  user: {
    profile: { basic: {}, preferences: {} },
    activity: { sessions: [] }
  },
  system: { config: {}, metrics: {} }
}

await context.set('complexData', nestedData)
```

### Deep Data Access
```typescript
const nested = await context.get('complexData')

// Access deeply nested properties
const userName = nested.user.profile.basic.name
const theme = nested.user.profile.preferences.theme
const sessionCount = nested.user.activity.sessions.length
```

### Context Accumulation
```typescript
// Combine multiple context values
const result = {
  original: await context.get('input'),
  processed: await context.get('processedData'),
  metadata: await context.get('metadata'),
  final: true
}

await context.set('finalResult', result)
```

## Expected Output

```
🚀 Flowcraft Context & State Management Example

🔄 BASIC CONTEXT MANAGEMENT
========================================
Workflow demonstrates:
• Reading initial data from context
• Conditional data checking
• Data transformation and updates
• Result accumulation
• Context finalization and cleanup

Input Data: {
  "id": "user-123",
  "name": "Alice Cooper",
  "email": "alice@example.com",
  "department": "engineering"
}

📖 [Read] Reading initial workflow data...
🔍 [Conditional] Checking for existing data...
🔄 [Transform] Transforming workflow data...
📊 [Accumulate] Accumulating workflow results...
🧹 [Finalize] Finalizing and cleaning up context...

✅ Basic context workflow completed!

📊 Final Accumulated Result:
   ID: user-123
   Name: Alice Cooper
   Source: new
   Steps: read → check → transform → accumulate

🧹 Clean Output:
   Status: completed
   Processed At: 2024-01-15T10:30:00.000Z
   Steps Completed: 4

🏗️ ADVANCED CONTEXT PATTERNS
========================================
🏗️ [Nested] Creating nested context structures...
🔎 [Query] Querying nested context data...

✅ Advanced context workflow completed!

🏗️ Nested Data Structure:
   User: John
   Theme: dark
   Environment: development

🔎 Query Results:
   User Name: John
   Theme: dark
   System Version: 1.0.0
   Paths Accessed: 3

💾 CONTEXT PERSISTENCE ACROSS EXECUTIONS
==================================================
▶️ Run 1:
📖 [Read] Reading initial workflow data...
...

▶️ Run 2:
📖 [Read] Reading initial workflow data...
...

📊 Comparison:
   Run 1 ID: run1
   Run 2 ID: run2
   ✓ Context is properly isolated between executions
```

## Key Concepts Demonstrated

### Context as Workflow State
- **Persistence**: Context maintains state throughout workflow execution
- **Isolation**: Each workflow run has its own context
- **Immutability**: Context updates don't affect other executions

### Data Flow Patterns
- **Sequential**: Data flows from node to node through context
- **Conditional**: Nodes can make decisions based on context state
- **Accumulative**: Multiple nodes can contribute to final results

### Advanced Data Management
- **Nested Structures**: Organize complex data hierarchically
- **Deep Access**: Query deeply nested properties
- **Transformation**: Modify data as it flows through the workflow

### Context Lifecycle
- **Initialization**: Initial context from workflow input
- **Updates**: Nodes read and write context throughout execution
- **Finalization**: Clean up and prepare final output
- **Persistence**: Context available until workflow completion

## Context Best Practices

### Organization
- Use consistent key naming conventions
- Group related data under nested objects
- Document context structure in workflow definitions

### Performance
- Avoid storing large objects unnecessarily
- Clean up intermediate data when possible
- Consider memory usage for long-running workflows

### Debugging
- Log context state at key points
- Use descriptive keys for easy debugging
- Validate context structure in critical nodes

## Files

- `src/workflow.ts` - Workflow definitions with context patterns
- `src/main.ts` - Demonstration of different context scenarios
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Next Steps

After understanding context management, explore:
- `built-in-nodes` - Flowcraft's built-in node types
- `error-handling` - Error handling and recovery patterns
- `reliability/retry-patterns` - Resilience patterns
