import type {
	BlueprintResolver,
	FlowcraftRuntime,
	EventStore,
	BlueprintGeneratorFn,
	TemplateStore,
	NodeImplementationRegistry,
	AsyncExecutionStore,
	BlueprintDatabase,
} from '../types'

export interface ToolsDeps {
	resolver?: BlueprintResolver
	runtime?: FlowcraftRuntime
	eventStore?: EventStore
	generate?: BlueprintGeneratorFn
	templates?: TemplateStore
	registry?: NodeImplementationRegistry
	asyncStore?: AsyncExecutionStore
	controllers?: Map<string, AbortController>
	executionIndex?: Map<
		string,
		{ executionId: string; blueprintId: string; status: string; startedAt: number }
	>
	database?: BlueprintDatabase
}
