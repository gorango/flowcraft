# `@flowcraft/compiler`

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/compiler.svg)](https://www.npmjs.com/package/@flowcraft/compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The `@flowcraft/compiler` is an optional, opt-in toolchain that transforms intuitive, imperative TypeScript code into a declarative Flowcraft workflow blueprint. It gives you the best of both worlds: a natural developer experience using standard language features and a powerful, serializable, and predictable graph-based execution model at runtime.

### The Problem: Declarative Overhead

The standard way to build a workflow in Flowcraft is with the `createFlow()` fluent API, which is powerful for defining graphs explicitly. However, for complex orchestration with loops, branches, and error handling, this can feel verbose compared to writing standard code.

**Fluent API (Declarative):**
```typescript
const flow = createFlow('my-loop')
  .node('start', getInitialPage)
  .node('controller', isPageAvailable, { config: { joinStrategy: 'any' } })
  .node('fetch', fetchPage)
  .node('process', processItems)
  .edge('start', 'controller')
  .edge('controller', 'fetch', { action: 'continue' })
  .edge('fetch', 'process')
  .edge('process', 'controller'); // Loop back
```

### The Solution: Imperative DX, Declarative Runtime

The compiler lets you write the same logic using a standard `while` loop. The toolchain handles the transformation to the declarative graph behind the scenes.

**Compiler Input (Imperative):**
```typescript
/** @step */
async function getInitialPage() {
  return { page: 1 };
}

/** @step */
async function fetchPage(params: { page: number }) {
  return { items: [/* ... */] };
}

/** @step */
async function processItems(params: { items: any[] }) {
  // Process items...
}

/** @flow */
async function myLoop(context: IAsyncContext) {
  let page = await getInitialPage();
  while (page !== null) {
    const items = await fetchPage({ page });
    await processItems({ items });
    page = await context.get('nextPage'); // State updated by nodes
  }
}
```

## Key Features

-   **Imperative DX**: Write workflows using standard `async/await`, `if/else`, `while`, `try/catch`, and `Promise.all`.
-   **Explicit Step Declaration**: Mark durable operations with `/** @step */` or `/** @flow */` JSDoc tags to ensure only intended functions become part of your workflow graph.
-   **Zero-Syntax**: No framework-specific keywords to learn. Orchestration is defined by native JavaScript control flow, guided by simple JSDoc markers.
-   **Compile-Time Type Safety**: The compiler leverages the TypeScript TypeChecker to validate the data flowing between your nodes, catching type errors before you even run your code.
-   **Composable by Default**: Create subflows simply by importing and `await`-ing another function marked with `/** @flow */`.
-   **Full Tooling Integration**: The generated blueprints include source location metadata, enabling visualization tools to link a graph node directly back to your source code.
-   **Optional & Backwards-Compatible**: Use the compiler for new, complex flows while maintaining existing workflows built with the fluent API.

## Installation

Install the compiler as a development dependency in your project.

```bash
npm install --save-dev @flowcraft/compiler
```

You will also need `flowcraft` and `typescript`:

```bash
npm install flowcraft
npm install --save-dev typescript
```

## Usage

Using the compiler is a simple, four-step process that fits into any standard build system.

### Step 1: Write Your Workflow and Step Functions

Create your step functions as regular exported `async` functions, marking each with the `/** @step */` JSDoc comment. Then, create a main workflow function that orchestrates them. Mark the orchestrator with the `/** @flow */` JSDoc comment.

`./src/steps.ts`
```typescript
// These are our atomic "step" functions
/** @step */
export async function createCart(params: { userId: string }) {
  console.log(`Creating cart for user ${params.userId}...`);
  return { cartId: 'cart-123' };
}

/** @step */
export async function addItems(params: { cartId: string; items: string[] }) {
  console.log(`Adding items to cart ${params.cartId}...`);
  return { success: true };
}

/** @step */
export async function processPayment(params: { cartId: string; token: string }) {
  console.log(`Processing payment for cart ${params.cartId}...`);
  return { transactionId: 'txn-xyz' };
}
```

`./src/checkout.ts`
```typescript
import { createCart, addItems, processPayment } from './steps';

/**
 * This is a "flow function". The compiler will transform it
 * into a WorkflowBlueprint.
 * @flow
 */
export async function checkoutFlow(context: any) {
  const userId = await context.get('userId');
  const items = await context.get('items');
  const token = await context.get('paymentToken');

  const cart = await createCart({ userId });
  await addItems({ cartId: cart.cartId, items });
  const payment = await processPayment({ cartId: cart.cartId, token });

  return payment;
}
```

### Step 2: Create a Build Script

Create a script that invokes the compiler. This can be a simple Node.js file.

`./scripts/compile-flows.js`
```javascript
import { compileProject } from '@flowcraft/compiler';
import path from 'node:path';
import fs from 'node:fs/promises';

async function build() {
  console.log('Compiling Flowcraft workflows...');

  // 1. Define project entry points and tsconfig path
  const entryPoints = [path.resolve('./src/checkout.ts')];
  const tsConfigPath = path.resolve('./tsconfig.json');

  // 2. Compile the project
  const { blueprints, registry, diagnostics, manifestSource } = compileProject(
    entryPoints,
    tsConfigPath,
  );

  // 3. Check for errors
  if (diagnostics.some(d => d.severity === 'error')) {
    console.error('Compilation failed with errors:');
    diagnostics.forEach(d => {
      console.error(`- ${d.file}:${d.line}:${d.column} - ${d.message}`);
    });
    process.exit(1);
  }

  // 4. Write the manifest file
  const manifestPath = path.resolve('./dist/flowcraft.manifest.js');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, manifestSource);

  console.log(`✅ Compilation successful! Manifest written to ${manifestPath}`);
  console.log(`Discovered ${Object.keys(blueprints).length} blueprints and ${Object.keys(registry).length} step functions.`);
}

build();
```

### Step 3: Run the Build Script

Execute the script from your terminal. You can also add this to the `scripts` section of your `package.json`.

```bash
node ./scripts/compile-flows.js
```

This generates a manifest file containing your blueprints and a registry of your step functions.

`./dist/flowcraft.manifest.js` (Generated File)
```javascript
// Generated by @flowcraft/compiler
import { createCart, addItems, processPayment } from '../src/steps';
// ... other imports

import type { NodeImplementation, WorkflowBlueprint } from 'flowcraft';

export const registry = {
  'createCart': createCart,
  'addItems': addItems,
  'processPayment': processPayment
};

export const blueprints = {
  'checkoutFlow': {
    "id": "checkoutFlow",
    "nodes": [/* ... */],
    "edges": [/* ... */]
  }
};
```

### Step 4: Use the Generated Manifest

Now, you can import the `blueprints` and `registry` from the generated manifest and pass them directly to the `FlowRuntime`.

`./src/main.ts`
```typescript
import { FlowRuntime } from 'flowcraft';
import { blueprints, registry } from '../dist/flowcraft.manifest.js';

async function main() {
  const runtime = new FlowRuntime({
    blueprints, // All compiled blueprints
    registry,   // All discovered step functions
  });

  const checkoutBlueprint = blueprints.checkoutFlow;
  const initialContext = {
    userId: 'user-42',
    items: ['item-a', 'item-b'],
    paymentToken: 'tok_1234',
  };

  const result = await runtime.run(checkoutBlueprint, initialContext);

  console.log('Workflow completed with status:', result.status);
  console.log('Final context:', result.context);
}

main();
```

## Authoring Flows: The Rules

To make the magic possible, you must follow a few simple rules when writing your flow functions.

#### 1. The `/** @flow */` Marker
Any `async` function that you want the compiler to transform into a blueprint **must** have the `/** @flow */` JSDoc tag. This is how the compiler discovers your flows.

#### 2. Step Functions
Any `async` function that is `await`-ed from within a flow function must be explicitly marked as a "step" with the `/** @step */` JSDoc tag. Only functions marked with `/** @step */` or `/** @flow */` are considered durable operations that can be part of a workflow graph. Attempting to await a regular `async` function will result in a compile-time error.

#### 3. Supported JavaScript Syntax

The compiler translates the following standard JavaScript syntax into graph structures:

| Syntax | Generated Flowcraft Pattern |
| :--- | :--- |
| `await step()` | A node and a sequential edge. |
| `if (condition) { ... } else { ... }` | A fork with conditional edges and a merge point with `joinStrategy: 'any'`. |
| `while (condition) { ... }` | A `loop-controller` node with a cyclical graph structure. |
| `for (const item of items) { ... }`| A `loop-controller` node (de-sugared into a `while` loop). |
| `try { ... } catch { ... }` | A fallback path. All nodes in the `try` block are configured to fallback to the first node in the `catch` block. |
| `await Promise.all([ ... ])` | A scatter-gather pattern where parallel branches merge at a successor node with `joinStrategy: 'all'`. |

#### 4. Unsupported Syntax

> **Note:** To ensure predictable graph generation, some imperative features are not supported inside a flow function. Using them will result in a compile-time error.

-   **`break` and `continue`**: Not supported within loops. Loop exit is controlled solely by the loop's condition.
-   **`finally`**: The `finally` block in a `try/catch/finally` statement is not supported.
-   **Complex Assignments**: Variable assignments from `await` calls must be simple `const` or `let` declarations. Re-assigning variables from multiple branches can lead to unpredictable graphs and is disallowed.

## Advanced Concepts

#### Subflows
Creating a subflow is completely natural. Simply define another flow with `/** @flow */`, import it, and `await` it from your main flow. The compiler will automatically generate a `subflow` node.

`./src/main-flow.ts`
```typescript
import { subFlow } from './sub-flow';

/** @step */
export async function doFirstStep() {
  return { result: 'first' };
}

/** @step */
export async function doLastStep() {
  return { result: 'last' };
}

/** @flow */
export async function mainFlow() {
  await doFirstStep();
  await subFlow(); // This becomes a 'subflow' node
  await doLastStep();
}
```

#### Compile-Time Type Safety
The compiler analyzes your code with the full power of the TypeScript engine. If you pass data of the wrong type between steps, the compiler will catch it and issue a diagnostic.

**Example:**

`./src/steps.ts`
```typescript
/** @step */
export async function processData(params: { value: number }) {
  return params.value * 2;
}```

`./src/my-flow.ts`
```typescript
/** @flow */
export async function typeErrorFlow() {
  // Compiler Error: 'value' expects type 'number', but receives 'string'
  await processData({ value: 'this is not a number' });
}
```

**Compiler Output:**
```
- src/my-flow.ts:4:3 - Type error in call to 'processData': argument of type 'string' is not assignable to parameter 'value' of type 'number'
```

## API Reference

#### `compileProject(entryFilePaths, tsConfigPath)`
-   `entryFilePaths: string[]`: An array of absolute paths to your entry-point files (your main flow functions).
-   `tsConfigPath: string`: An absolute path to your project's `tsconfig.json` file.
-   **Returns:** `CompilationOutput`
    -   `blueprints: Record<string, WorkflowBlueprint>`: A map of flow names to their generated blueprints.
    -   `registry: Record<string, { importPath: string, exportName: string }>`: A map of step names to their import locations.
    -   `diagnostics: CompilationDiagnostic[]`: An array of errors or warnings found during compilation.
    -   `manifestSource: string`: The generated source code for the manifest file.
