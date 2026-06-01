import type { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'

export type ToolStatus = 'completed' | 'failed' | 'awaiting' | 'started'

export interface ToolResult {
	status: ToolStatus
	data?: unknown
	executionId?: string
	awaitingNodeIds?: string[]
	awaitingDetails?: Record<string, unknown>
	error?: { message: string; code?: string }
	metadata?: {
		duration: number
		affectedNodes: string[]
		blueprintId: string
		blueprintVersion?: string
	}
}

export interface BlueprintResolveParams {
	id?: string
	name?: string
	version?: string
	[key: string]: unknown
}

export interface BlueprintResolveResult {
	blueprint: WorkflowBlueprint
	version: string
}

export interface BlueprintResolver {
	resolve(params: BlueprintResolveParams): Promise<BlueprintResolveResult>
}

export interface WorkflowToolConfig<TParams extends z.ZodType = z.ZodType> {
	name: string
	description: string
	parameters: TParams
	resolver?: BlueprintResolver
	triggers?: string[]
}

export interface WorkflowTool<TParams extends z.ZodType = z.ZodType> {
	name: string
	description: string
	parameters: TParams
	triggers?: string[]
	execute(params: z.infer<TParams>): Promise<ToolResult>
}

export type FlowRuntimeFactory = () =>
	| Promise<typeof import('flowcraft').FlowRuntime>
	| typeof import('flowcraft').FlowRuntime

export interface FlowcraftRuntime {
	run(
		blueprint: WorkflowBlueprint,
		initialState?: Record<string, unknown>,
		options?: Record<string, unknown>,
	): Promise<{
		context: Record<string, unknown> & {
			_executionId?: string
			_awaitingNodeIds?: string[]
			_awaitingDetails?: Record<string, unknown>
		}
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	resume(
		blueprint: WorkflowBlueprint,
		serializedContext: string | Record<string, unknown>,
		resumeData: { output?: Record<string, unknown>; action?: string },
		nodeId?: string,
		options?: Record<string, unknown>,
	): Promise<{
		context: Record<string, unknown> & {
			_executionId?: string
			_awaitingNodeIds?: string[]
			_awaitingDetails?: Record<string, unknown>
		}
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	executeNodes(
		blueprint: WorkflowBlueprint,
		executionId: string,
		nodeIds: string[],
		events: unknown[],
		options?: {
			inputOverrides?: Record<string, Record<string, unknown>>
			signal?: AbortSignal
			functionRegistry?: Map<string, unknown>
		},
	): Promise<{
		context: Record<string, unknown>
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	patchContext(
		blueprint: WorkflowBlueprint,
		executionId: string,
		events: unknown[],
		patches: Array<{ key: string; value: unknown; op: 'set' | 'delete' }>,
	): Promise<{
		context: Record<string, unknown>
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	markNodeCompleted(
		blueprint: WorkflowBlueprint,
		executionId: string,
		nodeId: string,
		output: unknown,
	): Promise<{
		context: Record<string, unknown>
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	requestPause(executionId: string): void
	rollbackExecution(
		blueprint: WorkflowBlueprint,
		executionId: string,
		events: unknown[],
		targetNodeId: string,
	): Promise<{
		context: Record<string, unknown>
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
	replayFrom(
		blueprint: WorkflowBlueprint,
		events: unknown[],
		fromNodeId: string,
		options?: {
			inputOverrides?: Record<string, unknown>
			executionId?: string
		},
	): Promise<{
		context: Record<string, unknown>
		serializedContext: string
		status: string
		errors?: Array<{ message: string; nodeId?: string }>
	}>
}

export interface EventStore {
	store(event: unknown, executionId: string): Promise<void>
	retrieve(executionId: string): Promise<unknown[]>
	retrieveMultiple(executionIds: string[]): Promise<Map<string, unknown[]>>
}

export interface BlueprintDatabase {
	find(params: { id: string; version?: string }): Promise<BlueprintResolveResult>
	list(params?: {
		limit?: number
		offset?: number
	}): Promise<Array<{ id: string; version: string; metadata?: Record<string, unknown> }>>
}

export interface BlueprintGeneratorFn {
	(params: {
		description: string
		nodes?: Array<{ id: string; purpose: string; inputs?: string[] }>
	}): Promise<WorkflowBlueprint>
}

export type ExecutionMode = 'sync' | 'async'

export interface AsyncExecutionStore {
	start(executionId: string, fn: () => Promise<ToolResult>): void
	get(executionId: string): Promise<ToolResult | undefined>
}

export interface NodeImplementationRegistry {
	has(usesKey: string): boolean
	getSchema?(usesKey: string): Record<string, unknown> | undefined
}

export interface TemplateStore {
	get(name: string): WorkflowBlueprint | undefined
	list(): string[]
}

export const INTERNAL_NODE_USES = [
	'wait',
	'sleep',
	'webhook',
	'subflow',
	'batch-scatter',
	'batch-gather',
	'loop-controller',
] as const

export function isInternalNode(usesKey: string): boolean {
	return INTERNAL_NODE_USES.includes(usesKey as (typeof INTERNAL_NODE_USES)[number])
}
