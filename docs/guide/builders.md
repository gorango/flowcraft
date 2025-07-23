# Builders

Builders are helper classes provided by Cascade to abstract away the manual construction of common and complex workflow patterns. They allow you to define high-level behavior, and the builder handles the underlying `Node` and `Flow` wiring for you.

You can import all builders from the main `cascade` package.

```typescript
import { SequenceFlow, BatchFlow, ParallelBatchFlow, GraphBuilder } from 'cascade'
```

## SequenceFlow

`SequenceFlow` is the simplest builder. It creates a linear `Flow` from a list of nodes, automatically chaining them together in the order they are provided. This is a convenient shortcut for creating basic sequential workflows.

### When to Use

Use `SequenceFlow` when you have a simple, fixed pipeline where each step follows the last without any conditional branching.

### Example

Instead of wiring nodes manually:

```typescript
const nodeA = new NodeA()
const nodeB = new NodeB()
const nodeC = new NodeC()

nodeA.next(nodeB)
nodeB.next(nodeC)

const manualFlow = new Flow(nodeA)
```

You can use `SequenceFlow` for a more concise definition:

```typescript
import { SequenceFlow } from 'cascade'

const sequence = new SequenceFlow(
  new NodeA(),
  new NodeB(),
  new NodeC()
)

await sequence.run(context)
```

## Batch Processing

Cascade provides two powerful builders for processing collections of items: `BatchFlow` for sequential processing and `ParallelBatchFlow` for concurrent processing.

To use them, you extend the base class and implement the `prep` method. This method's job is to return an array of parameter objects, where each object represents one item to be processed. The builder then runs the `Node` you provided in its constructor once for each of these parameter objects.

### BatchFlow (Sequential)

`BatchFlow` processes a collection of items one by one, in order. The next item is not processed until the previous one is completely finished.

#### When to Use

- When the order of processing is important.
- When processing tasks are CPU-bound and running them in parallel would not be beneficial.
- When you need to avoid overwhelming a rate-limited API.

### ParallelBatchFlow (Concurrent)

`ParallelBatchFlow` processes all items in a collection concurrently, running them in parallel. This can provide a massive performance boost for I/O-bound tasks, such as making multiple API calls or reading/writing multiple files.

#### When to Use

- For I/O-bound tasks (e.g., network requests, database queries, file system operations).
- When the order of processing does not matter.

### Example

Let's imagine we need to translate a document into several languages.

```typescript
import { ParallelBatchFlow, Node, TypedContext, contextKey } from 'cascade'

const LANGUAGES = contextKey<string[]>('languages')
const DOCUMENT_TEXT = contextKey<string>('document_text')

// The single unit of work: translates text to one language.
// It expects 'language' and 'text' in its params.
class TranslateNode extends Node {
  async exec({ params }) {
    console.log(`Translating to ${params.language}...`)
    // Fake API call
    const translation = await translateApiCall(params.text, params.language)
    console.log(`✓ Finished ${params.language}`)
    return translation
  }
}

// The builder orchestrates the batch process.
class TranslateFlow extends ParallelBatchFlow {
  constructor() {
    // Tell the builder which node to run for each item.
    super(new TranslateNode())
  }

  // prep provides the list of items to process.
  async prep({ ctx }) {
    const languages = ctx.get(LANGUAGES) || []
    const text = ctx.get(DOCUMENT_TEXT)

    // Return an array of parameter objects.
    // Each object will be merged into the TranslateNode's params.
    return languages.map(language => ({
      language,
      text
    }))
  }
}

// To run it:
const flow = new TranslateFlow()
const context = new TypedContext([
  [LANGUAGES, ['Spanish', 'German', 'Japanese']],
  [DOCUMENT_TEXT, 'Hello world!']
])
await flow.run(context)
// This will run three instances of TranslateNode in parallel.
```

## GraphBuilder

`GraphBuilder` is the most powerful and advanced builder. It allows you to construct a fully executable `Flow` from a declarative data structure (like a JSON object). This is the key to building dynamic, data-driven systems where the workflow logic is defined as configuration, not hard-coded.

### When to Use

- When you want to define workflow logic in a database or a set of JSON/YAML files.
- When you need to support complex, non-linear workflows with multiple start points, fan-outs, and fan-ins.
- For building modular AI Agent runtimes where different "tools" or "skills" are defined as graphs.

### How It Works

1. **Define a Graph**: You create a `WorkflowGraph` object containing a list of `nodes` and `edges`.
2. **Create a Node Registry**: You map the string `type` from your graph nodes to the actual `Node` classes in your code.
3. **Build the Flow**: You instantiate `GraphBuilder` with the registry and call `.build(graph)`.

The `GraphBuilder` intelligently analyzes the graph's structure. It automatically detects and handles:

- Multiple start nodes (initial fan-out).
- Mid-flow fan-out (a single node's action triggering multiple parallel branches).
- Fan-in (multiple branches converging on a single node).

For a complete, in-depth example, see the **[Dynamic AI Agent example (`sandbox/4.dag/`)](https://github.com/gorango/cascade/tree/master/sandbox/4.dag/)**.
