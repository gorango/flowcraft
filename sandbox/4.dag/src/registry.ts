import type { Flow, TypedWorkflowGraph } from 'flowcraft'
import type { AgentNodeTypeMap, DagContext } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ConsoleLogger, createNodeRegistry, GraphBuilder } from 'flowcraft'
import {
	LLMConditionNode,
	LLMProcessNode,
	LLMRouterNode,
	OutputNode,
} from './nodes'

export const nodeRegistry = createNodeRegistry<AgentNodeTypeMap, DagContext>({
	'llm-process': LLMProcessNode,
	'llm-condition': LLMConditionNode,
	'llm-router': LLMRouterNode,
	'output': OutputNode,
})

export class WorkflowRegistry {
	private flowCache = new Map<number, Flow>()
	private graphDatabase = new Map<number, TypedWorkflowGraph<AgentNodeTypeMap>>()
	private builder: GraphBuilder<AgentNodeTypeMap, DagContext>
	private isInitialized = false

	private constructor() {
		this.builder = new GraphBuilder<AgentNodeTypeMap, DagContext>(
			nodeRegistry,
			{ registry: this },
			{ subWorkflowNodeTypes: ['sub-workflow'] },
			new ConsoleLogger(),
		)
	}

	public static async create(useCaseDirectory: string): Promise<WorkflowRegistry> {
		const registry = new WorkflowRegistry()
		await registry.initialize(useCaseDirectory)
		return registry
	}

	private async initialize(useCaseDirectory: string): Promise<void> {
		if (this.isInitialized)
			return

		try {
			const files = await fs.readdir(useCaseDirectory)
			for (const file of files) {
				if (path.extname(file) === '.json') {
					const workflowId = Number.parseInt(path.basename(file, '.json'), 10)
					if (!Number.isNaN(workflowId)) {
						const filePath = path.join(useCaseDirectory, file)
						const fileContent = await fs.readFile(filePath, 'utf-8')
						const graphData: TypedWorkflowGraph<AgentNodeTypeMap> = JSON.parse(fileContent)
						this.graphDatabase.set(workflowId, graphData)
						console.log(`[Registry] Loaded workflow ${workflowId} from ${file}`)
					}
				}
			}
			this.isInitialized = true
		}
		catch (error) {
			console.error(`[Registry] Failed to initialize from directory ${useCaseDirectory}`, error)
			throw error
		}
	}

	public getGraph(workflowId: number): TypedWorkflowGraph<AgentNodeTypeMap> | undefined {
		return this.graphDatabase.get(workflowId)
	}

	async getFlow(workflowId: number): Promise<Flow> {
		if (!this.isInitialized)
			throw new Error('Registry is not initialized. Call `await WorkflowRegistry.create()`')

		if (this.flowCache.has(workflowId))
			return this.flowCache.get(workflowId)!

		console.log(`[Registry] Cache miss for workflow ${workflowId}. Building...`)
		const graphData = this.graphDatabase.get(workflowId)
		if (!graphData)
			throw new Error(`Workflow with id ${workflowId} not found in the database.`)

		const { flow } = this.builder.build(graphData)
		this.flowCache.set(workflowId, flow)
		return flow
	}
}
