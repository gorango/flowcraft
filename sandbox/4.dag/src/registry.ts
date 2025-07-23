import type { Flow, TypedWorkflowGraph } from 'cascade'
import type { AgentNodeTypeMap } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createNodeRegistry, GraphBuilder } from 'cascade'
import {
	LLMConditionNode,
	LLMProcessNode,
	LLMRouterNode,
	OutputNode,
	SubWorkflowNode,
} from './nodes'

export const nodeRegistry = createNodeRegistry({
	'llm-process': LLMProcessNode,
	'llm-condition': LLMConditionNode,
	'llm-router': LLMRouterNode,
	'sub-workflow': SubWorkflowNode,
	'output': OutputNode,
})

export class WorkflowRegistry {
	private flowCache = new Map<number, Flow>()
	private graphDatabase = new Map<number, TypedWorkflowGraph<AgentNodeTypeMap>>()
	private builder: GraphBuilder<AgentNodeTypeMap>
	private isInitialized = false

	private constructor() {
		this.builder = new GraphBuilder(nodeRegistry, { registry: this })
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
