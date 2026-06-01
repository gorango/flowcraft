import { describe, it, expect } from 'vitest'
import { createComposeTools } from '../../src/helpers/compose'
import { createActionTools } from '../../src/helpers/actions'
import { createDiscoverTools } from '../../src/helpers/discover'
import { createOrchestrateTools } from '../../src/helpers/orchestrate'
import { createAllTools } from '../../src/helpers'
import type { ToolsDeps } from '../../src/helpers/types'
import type {
	BlueprintResolver,
	BlueprintDatabase,
	FlowcraftRuntime,
	EventStore,
	BlueprintGeneratorFn,
	TemplateStore,
	NodeImplementationRegistry,
} from '../../src/types'

const mockResolver: BlueprintResolver = {
	resolve: async () => ({
		blueprint: { id: 'bp', nodes: [], edges: [], metadata: { version: '1.0' } },
		version: '1.0',
	}),
}

const mockRuntime: FlowcraftRuntime = {
	run: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	resume: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	executeNodes: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	patchContext: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	markNodeCompleted: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	requestPause: () => {},
	rollbackExecution: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
	replayFrom: async () => ({ context: {}, serializedContext: '', status: 'completed' }),
}

const mockEventStore: EventStore = {
	store: async () => {},
	retrieve: async () => [],
	retrieveMultiple: async () => new Map(),
}

const mockDatabase: BlueprintDatabase = {
	find: async () => ({
		blueprint: { id: 'bp', nodes: [], edges: [], metadata: { version: '1.0' } },
		version: '1.0',
	}),
	list: async () => [],
}

function toolNames(tools: { name: string }[]): string[] {
	return tools.map((t) => t.name).toSorted()
}

const mockGenerate: BlueprintGeneratorFn = async () =>
	({ id: 'g', nodes: [], edges: [], metadata: {} }) as never

describe('createComposeTools', () => {
	it('creates all tools when all deps provided', () => {
		const templates: TemplateStore = { get: () => undefined, list: () => [] }
		const deps: ToolsDeps = { generate: mockGenerate, templates }
		const tools = createComposeTools(deps)

		expect(toolNames(tools)).toEqual([
			'add_fallback_node',
			'add_retry_config',
			'check_data_flow',
			'check_node_implementations',
			'create_workflow',
			'describe_workflow',
			'generate_from_template',
			'get_blueprint_diff',
			'modify_workflow',
			'optimize_for_parallelism',
			'simulate_execution',
			'validate_workflow',
		])
	})

	it('excludes generate_from_template when templates missing', () => {
		const tools = createComposeTools({ generate: mockGenerate })

		const names = toolNames(tools)
		expect(names).not.toContain('generate_from_template')
		expect(names).toContain('create_workflow')
	})

	it('excludes create_workflow and generate_from_template when generate missing', () => {
		const tools = createComposeTools({})

		const names = toolNames(tools)
		expect(names).not.toContain('create_workflow')
		expect(names).not.toContain('generate_from_template')
	})

	it('passes registry to check_node_implementations when provided', () => {
		const registry: NodeImplementationRegistry = { has: () => true }
		const tools = createComposeTools({ registry })

		const names = toolNames(tools)
		expect(names).toContain('check_node_implementations')
	})

	it('passes no registry when not provided', () => {
		const tools = createComposeTools({})
		expect(toolNames(tools)).toContain('check_node_implementations')
	})
})

describe('createActionTools', () => {
	it('creates all tools when all deps provided', () => {
		const deps: ToolsDeps = {
			resolver: mockResolver,
			runtime: mockRuntime,
			eventStore: mockEventStore,
		}
		const tools = createActionTools(deps)

		expect(toolNames(tools)).toEqual([
			'check_node_readiness',
			'execute_node_batch',
			'execute_nodes_up_to',
			'get_node_error',
			'get_node_info',
			'get_node_output',
			'patch_node_context',
			'pause_before_node',
			'request_node_approval',
			'retry_node',
			'set_node_complete',
			'skip_node',
			'transform_node_input',
		])
	})

	it('creates subset when only eventStore', () => {
		const deps: ToolsDeps = { eventStore: mockEventStore }
		const tools = createActionTools(deps)

		expect(toolNames(tools)).toEqual(['get_node_error', 'get_node_output'])
	})

	it('creates subset when only resolver', () => {
		const deps: ToolsDeps = { resolver: mockResolver }
		const tools = createActionTools(deps)

		expect(toolNames(tools)).toEqual(['get_node_info'])
	})

	it('creates subset with resolver + runtime (no eventStore)', () => {
		const deps: ToolsDeps = { resolver: mockResolver, runtime: mockRuntime }
		const tools = createActionTools(deps)

		expect(toolNames(tools)).toEqual([
			'execute_node_batch',
			'execute_nodes_up_to',
			'get_node_info',
			'pause_before_node',
			'request_node_approval',
		])
	})

	it('returns empty with no deps', () => {
		const tools = createActionTools({})
		expect(tools).toHaveLength(0)
	})
})

describe('createDiscoverTools', () => {
	it('creates all tools when resolver + eventStore + database provided', () => {
		const deps: ToolsDeps = {
			resolver: mockResolver,
			eventStore: mockEventStore,
			database: mockDatabase,
		}
		const tools = createDiscoverTools(deps)

		expect(toolNames(tools)).toEqual([
			'get_execution',
			'get_workflow',
			'list_executions',
			'list_workflows',
		])
	})

	it('creates list_workflows from database', () => {
		const deps: ToolsDeps = { database: mockDatabase }
		const tools = createDiscoverTools(deps)

		const names = toolNames(tools)
		expect(names).toContain('list_workflows')
		expect(names).not.toContain('get_workflow')
	})

	it('creates execution tools from eventStore', () => {
		const deps: ToolsDeps = { eventStore: mockEventStore }
		const tools = createDiscoverTools(deps)

		expect(toolNames(tools)).toEqual(['get_execution', 'list_executions'])
	})

	it('creates list_workflows + get_workflow from resolver (list_workflows handles BlueprintResolver gracefully)', () => {
		const deps: ToolsDeps = { resolver: mockResolver }
		const tools = createDiscoverTools(deps)

		const names = toolNames(tools)
		expect(names).toContain('list_workflows')
		expect(names).toContain('get_workflow')
	})

	it('returns empty with no deps', () => {
		const tools = createDiscoverTools({})
		expect(tools).toHaveLength(0)
	})
})

describe('createOrchestrateTools', () => {
	it('creates all tools when all deps provided', () => {
		const deps: ToolsDeps = {
			resolver: mockResolver,
			runtime: mockRuntime,
			eventStore: mockEventStore,
			controllers: new Map(),
		}
		const tools = createOrchestrateTools(deps)

		expect(toolNames(tools)).toEqual([
			'batch_execute',
			'cancel_workflow',
			'check_workflow_status',
			'get_awaiting_nodes',
			'get_error_diagnosis',
			'get_execution_context',
			'get_execution_metrics',
			'get_execution_timeline',
			'pause_workflow',
			'request_approval',
			'restart_from_node',
			'resume_workflow',
			'retry_failed_nodes',
			'rollback_execution',
			'run_workflow',
			'run_workflows_parallel',
			'run_workflows_sequential',
			'skip_failed_node',
			'watch_execution',
		])
	})

	it('creates eventStore-only subset', () => {
		const deps: ToolsDeps = { eventStore: mockEventStore }
		const tools = createOrchestrateTools(deps)

		expect(toolNames(tools)).toEqual([
			'check_workflow_status',
			'get_awaiting_nodes',
			'get_error_diagnosis',
			'get_execution_context',
			'get_execution_metrics',
			'get_execution_timeline',
			'watch_execution',
		])
	})

	it('creates runtime-only subset', () => {
		const deps: ToolsDeps = { runtime: mockRuntime }
		const tools = createOrchestrateTools(deps)

		expect(toolNames(tools)).toEqual(['pause_workflow'])
	})

	it('creates resolver+runtime subset (including tools that only need runtime or resolver+runtime)', () => {
		const deps: ToolsDeps = { resolver: mockResolver, runtime: mockRuntime }
		const tools = createOrchestrateTools(deps)

		expect(toolNames(tools)).toEqual([
			'batch_execute',
			'pause_workflow',
			'request_approval',
			'run_workflow',
			'run_workflows_parallel',
			'run_workflows_sequential',
		])
	})

	it('adds cancel_workflow only when controllers provided', () => {
		const deps: ToolsDeps = {
			resolver: mockResolver,
			runtime: mockRuntime,
			eventStore: mockEventStore,
		}
		const noCancel = createOrchestrateTools(deps)
		expect(toolNames(noCancel)).not.toContain('cancel_workflow')

		const withCancel = createOrchestrateTools({ ...deps, controllers: new Map() })
		expect(toolNames(withCancel)).toContain('cancel_workflow')
	})

	it('returns empty with no deps', () => {
		const tools = createOrchestrateTools({})
		expect(tools).toHaveLength(0)
	})
})

describe('createAllTools', () => {
	it('concatenates all group tools', () => {
		const deps: ToolsDeps = {
			resolver: mockResolver,
			runtime: mockRuntime,
			eventStore: mockEventStore,
			database: mockDatabase,
			generate: mockGenerate,
			templates: { get: () => undefined, list: () => [] },
			controllers: new Map(),
		}
		const tools = createAllTools(deps)
		const names = toolNames(tools)

		expect(names).toContain('run_workflow')
		expect(names).toContain('get_node_info')
		expect(names).toContain('list_workflows')
		expect(names).toContain('create_workflow')

		const groupCounts = [
			createComposeTools(deps).length,
			createActionTools(deps).length,
			createDiscoverTools(deps).length,
			createOrchestrateTools(deps).length,
		]
		const sum = groupCounts.reduce((a, b) => a + b, 0)
		expect(tools).toHaveLength(sum)
	})

	it('returns only no-config compose tools when no deps', () => {
		const tools = createAllTools({})

		const names = toolNames(tools)
		expect(names).toEqual([
			'add_fallback_node',
			'add_retry_config',
			'check_data_flow',
			'check_node_implementations',
			'describe_workflow',
			'get_blueprint_diff',
			'modify_workflow',
			'optimize_for_parallelism',
			'simulate_execution',
			'validate_workflow',
		])
	})
})
