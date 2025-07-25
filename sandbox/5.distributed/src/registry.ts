import type { AbstractNode, Flow, TypedWorkflowGraph } from 'cascade'
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
	private nodeMapCache = new Map<number, Map<string, AbstractNode>>()
	private predecessorCountCache = new Map<number, Map<string, number>>()
	private graphDatabase = new Map<number, TypedWorkflowGraph<AgentNodeTypeMap>>()
	private builder: GraphBuilder<AgentNodeTypeMap>

	private constructor(nodeOptionsContext: Record<string, any> = {}) {
		this.builder = new GraphBuilder(nodeRegistry, { registry: this, ...nodeOptionsContext })
	}

	public static async create(useCaseDirectories: string[], nodeOptionsContext?: Record<string, any>): Promise<WorkflowRegistry> {
		const registry = new WorkflowRegistry(nodeOptionsContext)
		for (const dir of useCaseDirectories) {
			await registry.initialize(dir)
		}
		return registry
	}

	private async initialize(useCaseDirectory: string): Promise<void> {
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
		}
		catch (error) {
			console.error(`[Registry] Failed to initialize from directory ${useCaseDirectory}`, error)
			throw error
		}
	}

	private async buildAndCache(workflowId: number): Promise<void> {
		const graphData = this.graphDatabase.get(workflowId)
		if (!graphData)
			throw new Error(`Workflow with id ${workflowId} not found in the database.`)

		const { flow, nodeMap, predecessorCountMap } = this.builder.build(graphData)
		this.flowCache.set(workflowId, flow)
		this.nodeMapCache.set(workflowId, nodeMap)
		this.predecessorCountCache.set(workflowId, predecessorCountMap)
	}

	async getFlow(workflowId: number): Promise<Flow> {
		if (!this.flowCache.has(workflowId))
			await this.buildAndCache(workflowId)

		return this.flowCache.get(workflowId)!
	}

	async getNode(workflowId: number, nodeId: string): Promise<AbstractNode | undefined> {
		if (!this.nodeMapCache.has(workflowId))
			await this.buildAndCache(workflowId)

		return this.nodeMapCache.get(workflowId)?.get(nodeId)
	}

	async getPredecessorCount(workflowId: number, nodeId: string): Promise<number> {
		if (!this.predecessorCountCache.has(workflowId))
			await this.buildAndCache(workflowId)

		return this.predecessorCountCache.get(workflowId)?.get(nodeId) ?? 0
	}
}
