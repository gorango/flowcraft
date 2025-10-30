# Function vs Class-Based Nodes

This example demonstrates the two primary ways to define workflow nodes in Flowcraft: **function-based nodes** and **class-based nodes**. It shows when to use each approach and their respective advantages.

## Overview

The example processes a user through a workflow that:
1. **Validates** email using a function-based node
2. **Calculates** user score using a function-based node
3. **Enriches** profile using a class-based node
4. **Sends** notifications using a class-based node with lifecycle methods

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## Function-Based Nodes

### Simple Function Node
```typescript
async function validateEmail({ context }: any) {
  const user = await context.get('user')
  // Validation logic...
  return { output: 'Email validated' }
}

// Usage in workflow
.node('validateEmail', validateEmail)
```

**Characteristics:**
- ✅ **Stateless**: Fresh execution context each time
- ✅ **Simple**: Just a function with async logic
- ✅ **Testable**: Easy to unit test in isolation
- ✅ **Pure**: No side effects between executions

### Complex Function Node
```typescript
async function calculateUserScore({ context }: any) {
  const user = await context.get('user')
  let score = 0
  // Complex scoring logic...
  await context.set('userScore', score)
  return { output: `Score: ${score}` }
}
```

## Class-Based Nodes

### Basic Class Node
```typescript
import { BaseNode } from 'flowcraft'

class UserProfileEnricher extends BaseNode {
  async execute({ context }: any) {
    // Main execution logic
    const user = await context.get('user')
    // Enrichment logic...
    return { output: 'Profile enriched' }
  }
}

// Usage in workflow
.node('enrichProfile', new UserProfileEnricher())
```

### Class Node with Lifecycle Methods
```typescript
class NotificationSender extends BaseNode {
  private sentNotifications: string[] = []

  async beforeExecute({ context }: any) {
    // Setup logic (connections, initialization)
    this.sentNotifications = []
  }

  async execute({ context }: any) {
    // Main business logic
    // Send notifications...
  }

  async afterExecute({ context }: any) {
    // Cleanup logic (close connections, logging)
    console.log(`Sent ${this.sentNotifications.length} notifications`)
  }
}
```

**Characteristics:**
- ✅ **Stateful**: Can maintain state across executions
- ✅ **Lifecycle**: `beforeExecute()` and `afterExecute()` hooks
- ✅ **Complex**: Better for nodes needing setup/teardown
- ✅ **Reusable**: Instance can be reused across executions

## Expected Output

```
🚀 Flowcraft Function vs Class-Based Nodes Example

📋 Workflow Overview:
   Demonstrates: Function-based vs Class-based nodes
   Nodes: 4
   Function nodes: validateEmail, calculateUserScore
   Class nodes: UserProfileEnricher, NotificationSender

👤 Sample User Data:
{
  "name": "Sarah Chen",
  "email": "sarah.chen@example.com",
  "age": 32,
  "preferences": ["tech", "design", "music"]
}

▶️  Executing workflow with mixed node types...

🔍 [Function] Validating email...
✅ [Function] Email sarah.chen@example.com is valid
🧮 [Function] Calculating user score...
✅ [Function] User score calculated: 50/100
🎨 [Class] Enriching user profile...
✅ [Class] Profile enriched with level: Standard
📧 [Class] Preparing notification sender...
📧 [Class] Sending notifications...
📤 Welcome: Welcome Sarah Chen! You're a Standard member.
📤 Badges: You've earned badges: Experienced, Tech Enthusiast
✅ [Class] Sent 2 notifications
📧 [Class] Cleaning up notification sender...
📊 Total notifications sent in this execution: 2

✅ Workflow completed successfully!

📊 Final Results:
👤 User Level: Standard
🏆 User Score: 50/100
🏅 Badges Earned: Experienced, Tech Enthusiast
📧 Notifications Sent: 2
```

## Key Concepts Demonstrated

### Function-Based Nodes
- **Simplicity**: Pure functions with clear inputs/outputs
- **Statelessness**: No persistent state between executions
- **Testability**: Easy to test with mock contexts
- **Performance**: Lightweight with minimal overhead

### Class-Based Nodes
- **State Management**: Can maintain instance variables
- **Lifecycle Control**: Setup and cleanup operations
- **Complex Logic**: Better for nodes with dependencies
- **Resource Management**: Handle connections, file handles, etc.

### When to Use Each Approach

| Use Functions When: | Use Classes When: |
|---------------------|-------------------|
| Simple, pure logic | Stateful operations |
| No setup/teardown needed | Database connections |
| Easy to test | External API clients |
| Single execution step | Complex initialization |
| Stateless operations | Lifecycle management |

## Files

- `src/workflow.ts` - Workflow definition with both node types
- `src/main.ts` - Runtime execution and educational output
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Next Steps

After understanding node types, explore:
- `context-state-management` - Advanced context manipulation
- `built-in-nodes` - Flowcraft's built-in node types
- `error-handling` - Error handling patterns
