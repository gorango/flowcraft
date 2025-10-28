# Imperative Workflows

Flowcraft's compiler enables writing workflows using familiar imperative TypeScript code. Instead of manually constructing graph structures, you write async functions with control flow statements that the compiler transforms into declarative blueprints at build time.

## Compiler Overview

The Flowcraft Compiler (`@flowcraft/compiler`) is an optional tool that transforms imperative TypeScript code into declarative workflow blueprints. It provides an imperative developer experience while maintaining the benefits of declarative runtime execution.

## The Problem: Declarative Overhead

When building complex workflows with the Fluent API, you often need to manually construct graph structures. For example, a simple retry loop might look like this:

```typescript
import { createFlow } from 'flowcraft'

const workflow = createFlow()
  .node('fetchData', async () => {
    // ... fetch logic
  })
  .node('processData', async (ctx) => {
    // ... process logic
  })
  .edge('fetchData', 'processData')
  .edge('processData', 'fetchData', { condition: 'retryCount < 3' })
```

While powerful, this approach can become verbose and error-prone for complex orchestrations.

## The Solution: Imperative DX, Declarative Runtime

With the compiler, you write familiar imperative code, and it automatically generates the declarative blueprint:

```typescript
/** @flow */
export async function myWorkflow(input: string) {
  let retryCount = 0
  while (retryCount < 3) {
    try {
      const data = await fetchData(input)
      const result = await processData(data)
      return result
    } catch (error) {
      retryCount++
    }
  }
  throw new Error('Max retries exceeded')
}
```

This imperative code compiles to the same declarative graph as the Fluent API example above.

## Key Features

- **Imperative DX**: Write workflows using familiar control flow (loops, conditionals, try/catch)
- **Zero-Syntax**: No special DSL - just TypeScript with JSDoc annotations
- **Type Safety**: Full TypeScript support with compile-time validation
- **Composability**: Import and compose subflows naturally
- **Tooling Integration**: Works with your existing build tools (Vite, Next.js, etc.)

## Next Steps

- [Configuration](/guide/compiler/configuration) - How to set up the compiler
- [Authoring Guide](/guide/compiler/authoring-guide) - Writing compiler-compatible code
- [Build Tool Integration](/guide/compiler/build-tools) - Integrating with your build process
