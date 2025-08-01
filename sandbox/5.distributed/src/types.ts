import type { NodeConstructorOptions, NodeTypeMap } from 'flowcraft'
import type { WorkflowRegistry } from './registry'
import { contextKey } from 'flowcraft'

// A generic structure for the `inputs` object in our node data.
// It maps a template key to a context key (or an array of fallback keys).
type NodeInputMap = Record<string, string | string[]>

export interface AgentNodeTypeMap extends NodeTypeMap {
	'llm-process': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'llm-condition': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'llm-router': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'output': {
		promptTemplate: string
		inputs: NodeInputMap
		outputKey?: string // defaults to 'final_output'
		returnAction?: string
	}
	'sub-workflow': {
		workflowId: number
		inputs?: NodeInputMap
		outputs?: Record<string, string>
	}
}

export interface DistributedContext { registry: WorkflowRegistry }

export type AiNodeOptions<T extends keyof AgentNodeTypeMap>
	= NodeConstructorOptions<AgentNodeTypeMap[T], DistributedContext>

// A unique ID for an entire workflow execution.
export const RUN_ID = contextKey<string>('run_id')

export interface NodeJobPayload {
	runId: string
	workflowId: number
	nodeId: string
	context: Record<string, any>
	params: Record<string, any>
}

export const FINAL_ACTION = Symbol('final_action')

export interface WorkflowStatus {
	status: 'completed' | 'failed' | 'cancelled'
	payload?: any
	reason?: string
}
