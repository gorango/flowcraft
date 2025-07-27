import type { TypedWorkflowGraph } from 'flowcraft'
import type { RagNodeTypeMap } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ConsoleLogger, TypedContext } from 'flowcraft'
import SuperJSON from 'superjson'
import { DOCUMENT_PATH, FINAL_ANSWER, keyRegistry, QUESTION } from './nodes'
import { ragGraphBuilder } from './registry'

async function main() {
	console.log('--- RAG Agent Workflow ---')

	// 1. Load the declarative workflow graph from the JSON file.
	const graphPath = path.join(process.cwd(), 'data', 'rag.json')
	const graphContent = await fs.readFile(graphPath, 'utf-8')
	const graph: TypedWorkflowGraph<RagNodeTypeMap> = JSON.parse(graphContent)

	// 2. Build the executable flow from the graph definition.
	const { flow } = ragGraphBuilder.build(graph)

	// 3. Set up the initial context for the workflow run.
	const documentPath = path.join(process.cwd(), 'documents', 'sample-flowcraft.txt')
	const context = new TypedContext()
	context.set(DOCUMENT_PATH, documentPath)
	context.set(QUESTION, 'How does Flowcraft handle conditional branching?')

	// 4. Run the workflow.
	await flow.run(context, { logger: new ConsoleLogger() })

	console.log('\n--- Workflow Complete ---\n')

	// 5. Inspect the final state of the context.
	const finalAnswer = context.get(FINAL_ANSWER)
	console.log('Final Answer:\n', finalAnswer)

	// 6. Demonstrate robust serialization of the final context.
	console.log('\n\n--- Final Context State (Serialized with SuperJSON) ---')

	// maps the symbol to its string description for superjson
	keyRegistry.forEach((symbolValue, stringKey) => SuperJSON.registerSymbol(symbolValue, stringKey))
	const finalContextMap = new Map(context.entries())
	const outputFilePath = path.join(process.cwd(), 'tmp', 'final-context.json')
	const serializedObject = SuperJSON.serialize(finalContextMap)

	// Save the full, untruncated data to a file for detailed inspection.
	await fs.mkdir(path.dirname(outputFilePath), { recursive: true })
	await fs.writeFile(outputFilePath, JSON.stringify(serializedObject, null, 2), 'utf-8')
	console.log(`Full context saved to: ${outputFilePath}\n`)
}

main().catch(console.error)
