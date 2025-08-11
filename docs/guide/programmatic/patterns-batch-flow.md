# Common Patterns: Batch Processing

Batch processing is a common pattern where you need to run the *same* operation on many different pieces of data. This is different from `ParallelFlow`, which runs *different* nodes concurrently.

Flowcraft provides two abstract builder classes for this pattern: `BatchFlow` for sequential processing and `ParallelBatchFlow` for concurrent processing.

## The Pattern

To use a batch flow, you extend one of the base classes and implement two things:

1.  `protected abstract nodeToRun`: You must provide the `Node` instance that will be executed for each item in the batch. This is the "unit of work."
2.  `async prep()`: This method provides the list of items to process. You return an array of parameter objects. The `nodeToRun` will be executed once for each of these objects, with its contents merged into the node's `params`.

## `BatchFlow` (Sequential)

`BatchFlow` processes items one by one, in order. The next item is not processed until the previous one is completely finished.

**Use Cases**:
- Processing items where order is critical.
- Interacting with a rate-limited API where you must avoid sending multiple requests at once.

## `ParallelBatchFlow` (Concurrent)

`ParallelBatchFlow` processes all items concurrently. This provides a massive performance boost for I/O-bound tasks.

**Use Cases**:
- Translating a document into 10 languages.
- Fetching thumbnails for a list of 100 video URLs.
- Processing multiple user-uploaded files simultaneously.

## Example: The Parallel Document Translator

This example uses `ParallelBatchFlow` to translate a document into several languages at once.

### 1. Define the Unit of Work

First, we define the `TranslateNode`. This node's job is to translate a single piece of text to a single target language. It gets this information from its `params`.

```typescript
import { contextKey, Node } from 'flowcraft'

const TRANSLATIONS = contextKey<Map<string, string>>('translations')

// This node performs one translation.
class TranslateNode extends Node {
	async exec({ params }) {
		const { text, language } = params
		console.log(`Translating text to ${language}...`)
		// In a real app, this would be an API call.
		await new Promise(resolve => setTimeout(resolve, Math.random() * 500))
		return `Translated text in ${language}`
	}

	async post({ ctx, params, execRes: translatedText }) {
		const translations = (await ctx.get(TRANSLATIONS)) || new Map()
		translations.set(params.language, translatedText)
		await ctx.set(TRANSLATIONS, translations)
	}
}
```

### 2. Create the Batch Flow Builder

Next, we create a `TranslateFlow` class that extends `ParallelBatchFlow`. We tell it to use our `TranslateNode` and implement `prep` to generate the list of translation jobs.

```typescript
import { AbstractNode, ParallelBatchFlow } from 'flowcraft'

const LANGUAGES = contextKey<string[]>('languages')
const DOCUMENT_TEXT = contextKey<string>('document_text')

// The builder orchestrates the batch process.
class TranslateFlow extends ParallelBatchFlow {
	// 1. Implement the abstract property to define which node to run for each item.
	protected nodeToRun: AbstractNode = new TranslateNode()

	// 2. The `prep` method provides the list of items to process.
	async prep({ ctx }) {
		const languages = (await ctx.get(LANGUAGES)) || []
		const text = await ctx.get(DOCUMENT_TEXT)

		// Return an array of parameter objects.
		// Each object will be merged into the TranslateNode's params for one parallel run.
		return languages.map(language => ({ language, text }))
	}
}
```

### 3. Run the Flow

Finally, we set up the initial context and run our `TranslateFlow`.

```typescript
import { TypedContext } from 'flowcraft'

const context = new TypedContext([
	[DOCUMENT_TEXT, 'This is a test document.'],
	[LANGUAGES, ['French', 'Spanish', 'German']],
	[TRANSLATIONS, new Map()],
])

const translateFlow = new TranslateFlow()
await translateFlow.run(context)

console.log('All translations complete:')
console.log(await context.get(TRANSLATIONS))
```

The output will show the translations running concurrently and the final map containing all results.
