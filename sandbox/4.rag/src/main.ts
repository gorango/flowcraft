import type { ISerializer } from 'flowcraft'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { FlowRuntime } from 'flowcraft'
import SuperJSON from 'superjson'
import { createRagFlow } from './flow.js'
import { DocumentChunk, SearchResult } from './types.js'

// Register custom classes with SuperJSON for proper serialization
SuperJSON.registerClass(DocumentChunk)
SuperJSON.registerClass(SearchResult)

// Create a serializer adapter for the runtime
class SuperJsonSerializer implements ISerializer {
	serialize(data: Record<string, any>): string {
		return SuperJSON.stringify(data)
	}

	deserialize(text: string): Record<string, any> {
		return SuperJSON.parse(text)
	}
}

async function main() {
	console.log('--- RAG Agent Workflow ---')

	const ragFlow = createRagFlow()
	const blueprint = ragFlow.toBlueprint()
	const functionRegistry = ragFlow.getFunctionRegistry()

	const runtime = new FlowRuntime({
		serializer: new SuperJsonSerializer(), // Plug in the custom serializer
	})

	const documentPath = path.join(process.cwd(), 'documents', 'sample-flowcraft.txt')
	const initialContext = {
		document_path: documentPath,
		question: 'How does Flowcraft handle conditional branching?',
	}

	const result = await runtime.run(blueprint, initialContext, { functionRegistry })

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Answer:\n', result.context.final_answer)

	console.log('\n\n--- Final Context State (Serialized with SuperJSON) ---')
	const outputFilePath = path.join(process.cwd(), 'tmp', 'final-context-v2.json')
	await fs.mkdir(path.dirname(outputFilePath), { recursive: true })

	const serializedContext = result.serializedContext
	await fs.writeFile(outputFilePath, JSON.stringify(JSON.parse(serializedContext), null, 2), 'utf-8')

	console.log(`Full context saved to: ${outputFilePath}\n`)
	console.log('Inspect the file to see that complex types like Map, Date, and classes were preserved.')
}

main().catch(console.error)
