import { describe, it, expect } from 'vitest'
import { createAllTools } from '../src/helpers'
import type { ToolsDeps } from '../src/helpers/types'
import type {
	BlueprintResolver,
	FlowcraftRuntime,
	EventStore,
	BlueprintGeneratorFn,
	TemplateStore,
} from '../src/types'

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

const mockGenerate: BlueprintGeneratorFn = async () =>
	({ id: 'g', nodes: [], edges: [], metadata: {} }) as never

const templates: TemplateStore = { get: () => undefined, list: () => [] }

function fullDeps(): ToolsDeps {
	return {
		resolver: mockResolver,
		runtime: mockRuntime,
		eventStore: mockEventStore,
		generate: mockGenerate,
		templates,
		controllers: new Map(),
	}
}

describe('tool triggers', () => {
	it('every curated tool has a non-empty triggers array', () => {
		const tools = createAllTools(fullDeps())
		const missing = tools.filter((t) => !t.triggers || t.triggers.length === 0)
		expect(missing.map((t) => t.name)).toEqual([])
	})
})
