<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { ConsoleLogger, createFlow, FlowRuntime, type WorkflowResult } from 'flowcraft'
import FlowNodeGeneric from '~/components/Flow/Node/Generic.vue'
import { useEventBus } from '~/composables/useEventBus'

interface DocumentChunk {
	id: string
	text: string
	source: string
	ingestedAt: string
}

interface SearchResult {
	chunk: DocumentChunk
	score: number
}

interface RagContext {
	document_path: string
	question: string
	file_content: string
	vector_db: Map<string, { chunk: DocumentChunk; vector: number[] }>
	search_results: SearchResult[]
	final_answer: string
	load_and_chunk: DocumentChunk[]
	embedding_results: { chunk: DocumentChunk; vector: number[] }[]
}

const flow = useVueFlow('rag-workflow')

async function loadAndChunk(ctx: any) {
	const path = await ctx.context.get('document_path')
	const fileContent = await ctx.context.get('file_content')
	if (!fileContent) {
		throw new TypeError('file_content is required')
	}
	console.log(`[Node] Chunking document: ${path}`)

	const chunks: DocumentChunk[] = []
	const paragraphs = (fileContent as string).split(/\n\s*\n/).filter((p: string) => p.trim().length > 10)

	for (const [i, paragraph] of paragraphs.entries()) {
		const chunkId = `chunk_${i}`
		const chunk: DocumentChunk = {
			id: chunkId,
			text: paragraph.trim(),
			source: path,
			ingestedAt: new Date().toISOString(),
		}
		chunks.push(chunk)
	}
	console.log(`[Node] Created ${chunks.length} chunks.`)
	return { output: chunks }
}

async function generateSingleEmbedding(ctx: any) {
	const chunk = ctx.input as DocumentChunk
	if (!chunk || !chunk.text) {
		throw new TypeError('Batch worker for embeddings received an invalid chunk.')
	}
	const vector = await getEmbedding(chunk.text)
	return { output: { chunk, vector } }
}

async function storeInVectorDB(ctx: any) {
	console.log('[Node] Simulating storage of chunks and vectors.')
	const embeddingResults = ctx.input as { chunk: DocumentChunk; vector: number[] }[]
	const db = new Map<string, { chunk: DocumentChunk; vector: number[] }>()

	if (!embeddingResults || embeddingResults.length === 0) {
		console.warn('[Node] No embedding results to store in DB. Upstream might have failed.')
		return { output: 'DB Ready (empty)' }
	}

	for (const { chunk, vector } of embeddingResults) {
		if (chunk && vector) {
			db.set(chunk.id, { chunk, vector })
		}
	}
	await ctx.context.set('vector_db', db)
	console.log(`[Node] DB is ready with ${db.size} entries.`)
	return { output: 'DB Ready' }
}

async function vectorSearch(ctx: any) {
	const question = await ctx.context.get('question')
	const db = await ctx.context.get('vector_db')
	console.log(`[Node] Performing vector search for question: "${question}"`)

	if (!db || db.size === 0) {
		console.error('[Node] Vector DB is empty. Cannot perform search.')
		return { output: [] }
	}

	if (!question) {
		throw new TypeError('question is required')
	}

	const questionVector = await getEmbedding(question)
	const similarities: { id: string; score: number }[] = []
	for (const [chunkId, { vector }] of db.entries()) {
		if (vector && questionVector) {
			const score = cosineSimilarity(questionVector, vector)
			similarities.push({ id: chunkId, score })
		}
	}

	similarities.sort((a, b) => b.score - a.score)
	const topResults = similarities.slice(0, 2)

	const searchResults: SearchResult[] = topResults.map(({ id, score }) => {
		const entry = db.get(id)
		if (!entry) {
			throw new TypeError(`Chunk ${id} not found in DB`)
		}
		return { chunk: entry.chunk, score }
	})
	await ctx.context.set('search_results', searchResults)
	console.log(`[Node] Found ${searchResults.length} relevant results.`)
	return { output: searchResults }
}

async function generateFinalAnswer(ctx: any) {
	const searchResults = ctx.input as SearchResult[]
	const contextText = searchResults?.map((r) => r.chunk.text).join('\n\n---\n\n') ?? 'No context found.'
	const question = await ctx.context.get('question')
	if (!question) {
		throw new TypeError('question is required')
	}
	const prompt = resolveTemplate(
		"Based on the following context, please provide a clear and concise answer to the user's question.\n\n**CONTEXT**\n\n{{context}}\n\n**QUESTION**\n\n{{question}}\n\n**ANSWER**",
		{ context: contextText, question },
	)
	const answer = await callLLM(prompt)
	await ctx.context.set('final_answer', answer)
	return { output: answer }
}

async function callLLM(prompt: string): Promise<string> {
	try {
		const { response } = await $fetch<{ response: string }>('/api/llm', {
			method: 'POST',
			body: { prompt },
		})
		return response
	}
	catch (error: any) {
		console.error('Error calling LLM:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

async function getEmbedding(text: string): Promise<number[]> {
	try {
		const { response } = await $fetch<{ response: number[] }>('/api/llm', {
			method: 'POST',
			body: { type: 'embedding', input: text.replace(/\n/g, ' ') },
		})
		return response
	}
	catch (error: any) {
		console.error('Error calling Embeddings API:', error)
		throw new Error(`Embeddings API call failed: ${error.message}`)
	}
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
	const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i]!, 0)
	const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
	const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
	return dotProduct / (magnitudeA * magnitudeB)
}

function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		if (value === undefined || value === null) {
			console.warn(`Template variable '{{${key.trim()}}}' not found in data.`)
			return ''
		}
		return String(value)
	})
}

async function readFileContent(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => resolve(e.target?.result as string)
		reader.onerror = (e) => reject(e)
		reader.readAsText(file)
	})
}

const greetingFlow = createFlow<RagContext>('advanced-rag-agent')
	.node('load_and_chunk', loadAndChunk)
	.node('store_in_db', storeInVectorDB, { inputs: 'embedding_results' })
	.node('vector_search', vectorSearch)
	.node('generate_final_answer', generateFinalAnswer)
	.batch('generate-embeddings', generateSingleEmbedding, {
		inputKey: 'load_and_chunk',
		outputKey: 'embedding_results',
	})
	.edge('load_and_chunk', 'generate-embeddings_scatter')
	.edge('generate-embeddings_gather', 'store_in_db')
	.edge('store_in_db', 'vector_search')
	.edge('vector_search', 'generate_final_answer')

const blueprint = greetingFlow.toBlueprint()
const functionRegistry = greetingFlow.getFunctionRegistry()

const vueFlowNodes: Node[] = [
	{
		id: 'load_and_chunk',
		position: { x: 0, y: 100 },
		data: { label: 'Load & Chunk Document' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
	{
		id: 'generate-embeddings_scatter',
		position: { x: (256 + 56) * 1, y: 100 },
		data: { label: 'Scatter Embeddings' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
	{
		id: 'generate-embeddings_gather',
		position: { x: (256 + 56) * 2, y: 100 },
		data: { label: 'Gather Embeddings' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
	{
		id: 'store_in_db',
		position: { x: (256 + 56) * 3, y: 100 },
		data: { label: 'Store in Vector DB' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
	{
		id: 'vector_search',
		position: { x: (256 + 56) * 4, y: 100 },
		data: { label: 'Vector Search' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
	{
		id: 'generate_final_answer',
		position: { x: (256 + 56) * 5, y: 100 },
		data: { label: 'Generate Final Answer' },
		targetPosition: Position.Left,
		sourcePosition: Position.Right,
	},
]

const vueFlowEdges: Edge[] = [
	{
		id: 'edge-1',
		source: 'load_and_chunk',
		target: 'generate-embeddings_scatter',
		type: 'smoothstep',
		animated: true,
	},
	{
		id: 'edge-2',
		source: 'generate-embeddings_scatter',
		target: 'generate-embeddings_gather',
		type: 'smoothstep',
		animated: true,
	},
	{
		id: 'edge-3',
		source: 'generate-embeddings_gather',
		target: 'store_in_db',
		type: 'smoothstep',
		animated: true,
	},
	{
		id: 'edge-4',
		source: 'store_in_db',
		target: 'vector_search',
		type: 'smoothstep',
		animated: true,
	},
	{
		id: 'edge-5',
		source: 'vector_search',
		target: 'generate_final_answer',
		type: 'smoothstep',
		animated: true,
	},
]

const nodes = computed(() => flow.nodes.value)
const edges = computed(() => flow.edges.value)

onMounted(() => {
	flow.setNodes(vueFlowNodes)
	flow.setEdges(vueFlowEdges)
})

const { eventBus } = useEventBus()

const nodeData = ref(new Map<string, { inputs?: any, outputs?: any, contextChanges?: Record<string, any>, status?: 'idle' | 'pending' | 'completed' | 'failed' }>())

function getNodeData(nodeId: string) {
	return nodeData.value.get(nodeId) || {}
}

eventBus.on('node:start', (event) => {
	const { nodeId, input } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || { status: 'idle' as const }
	nodeData.value.set(nodeId, { ...currentData, status: 'pending' as const, inputs: input })
})

eventBus.on('node:finish', (event) => {
	const { nodeId, result } = event.payload as any
	const currentData = nodeData.value.get(nodeId) || { status: 'idle' as const }
	nodeData.value.set(nodeId, { ...currentData, status: 'completed' as const, outputs: result.output })
})

eventBus.on('context:change', (event) => {
	const { sourceNode, key, value } = event.payload as any
	const currentData = nodeData.value.get(sourceNode) || { contextChanges: {} }
	const updatedContextChanges = { ...currentData.contextChanges, [key]: value }
	nodeData.value.set(sourceNode, { ...currentData, contextChanges: updatedContextChanges })
})

const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	eventBus,
})

const isRunning = ref(false)
const executionResult = ref<WorkflowResult | null>(null)
const executionError = ref<string | null>(null)
const question = ref('How does Flowcraft implement declarative workflows?')
const uploadedFile = ref<File | null>(null)

async function runWorkflow() {
	if (!uploadedFile.value) {
		executionError.value = 'Please upload a document first.'
		return
	}
	isRunning.value = true
	executionError.value = null
	nodeData.value.clear()
	blueprint.nodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	try {
		const fileContent = await readFileContent(uploadedFile.value)
		const result = await runtime.run(blueprint, {
			document_path: uploadedFile.value.name,
			question: question.value,
			file_content: fileContent,
		}, { functionRegistry })
		executionResult.value = result
	}
	catch (error) {
		executionError.value = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error running workflow:', error)
	}
	finally {
		isRunning.value = false
		await new Promise(r => setTimeout(r))
	}
}

async function clearWorkflow() {
	executionResult.value = null
	executionError.value = null
	nodeData.value.clear()
	vueFlowNodes.forEach((node) => {
		nodeData.value.set(node.id, { status: 'idle' })
	})
	await new Promise(r => setTimeout(r))
}

function handleFileUpload(event: Event) {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (file) {
		uploadedFile.value = file
	}
}
</script>

<template>
	<div class="mx-auto max-w-6xl p-4">
		<Card>
			<CardHeader>
				<CardTitle>RAG Workflow Example</CardTitle>
			</CardHeader>

			<CardContent class="space-y-6">
				<div class="p-4 bg-muted/50 border rounded-lg text-muted-foreground text-sm">
					<p>This workflow demonstrates a Retrieval-Augmented Generation (RAG) agent:</p>
					<ol class="list-decimal list-inside mt-2">
						<li><strong>Load & Chunk Document:</strong> Reads and splits the document into chunks.</li>
						<li><strong>Generate Embeddings:</strong> Creates vector embeddings for each chunk in parallel.</li>
						<li><strong>Store in Vector DB:</strong> Simulates storing chunks and vectors in a vector database.</li>
						<li><strong>Vector Search:</strong> Finds relevant chunks based on the question's embedding.</li>
						<li><strong>Generate Final Answer:</strong> Synthesizes an answer using the retrieved context.</li>
					</ol>
				</div>

				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium mb-2">Upload Document</label>
						<Input type="file" @change="handleFileUpload" accept=".md,.txt" />
					</div>

					<div>
						<label for="question" class="block text-sm font-medium mb-2">Question:</label>
						<Input id="question" v-model="question" placeholder="Enter your question..." />
					</div>
				</div>

				<div class="flex gap-2">
					<Button :disabled="isRunning" @click="runWorkflow">
						{{ isRunning ? 'Running...' : 'Run Workflow' }}
					</Button>
					<Button variant="outline" @click="clearWorkflow">
						Clear Results
					</Button>
				</div>

				<div class="h-full border rounded-lg aspect-square md:aspect-video">
					<ClientOnly>
						<VueFlow
							class="flow"
							:nodes="nodes"
							:edges="edges"
							:fit-view-on-init="true"
						>
							<Background />
							<template #node-default="nodeProps">
								<FlowNodeGeneric
									v-bind="nodeProps"
									:node-data="getNodeData(nodeProps.id)"
								/>
							</template>
						</VueFlow>
					</ClientOnly>
				</div>

				<div v-if="executionResult" class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
					<h3 class="font-bold text-green-800 dark:text-green-200">
						Final Answer:
					</h3>
					<p class="text-green-700 whitespace-pre-wrap">
						{{ executionResult.context?.final_answer }}
					</p>
				</div>

				<div v-if="executionError" class="p-4 bg-destructive text-destructive-foreground rounded-lg">
					<h3 class="font-bold">
						Execution Error:
					</h3>
					<p>{{ executionError }}</p>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
