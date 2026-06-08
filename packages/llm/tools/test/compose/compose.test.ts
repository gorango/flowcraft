import { describe, it, expect } from 'vitest'
import { createCheckNodeImplementationsTool } from '../../src/compose/check-implementations'
import { createAddRetryConfigTool } from '../../src/compose/add-retry-config'
import { createAddFallbackNodeTool } from '../../src/compose/add-fallback'
import { createGetBlueprintDiffTool } from '../../src/compose/get-diff'
import { createSimulateExecutionTool } from '../../src/compose/simulate'
import { createOptimizeForParallelismTool } from '../../src/compose/optimize-parallelism'
import { createCheckDataFlowTool } from '../../src/compose/check-data-flow'
import { createGenerateFromTemplateTool } from '../../src/compose/generate-template'
import type { TemplateStore, NodeImplementationRegistry } from '../../src/types'

const mockBlueprint = {
	id: 'test-bp',
	nodes: [
		{ id: 'a', uses: 'mock_node' },
		{ id: 'b', uses: 'wait' },
		{ id: 'c', uses: 'unknown_impl' },
	],
	edges: [
		{ source: 'a', target: 'b' },
		{ source: 'b', target: 'c' },
	],
	metadata: { version: '1.0' },
}

describe('createCheckNodeImplementationsTool', () => {
	it('marks internal nodes as implemented', async () => {
		const tool = createCheckNodeImplementationsTool()
		const result = await tool.execute({ blueprint: mockBlueprint })
		const waitNode = result.data.nodes.find((n) => n.id === 'b')
		expect(waitNode?.implemented).toBe(true)
		expect(waitNode?.isInternal).toBe(true)
	})

	it('marks unknown nodes as null when no registry', async () => {
		const tool = createCheckNodeImplementationsTool()
		const result = await tool.execute({ blueprint: mockBlueprint })
		const mockNode = result.data.nodes.find((n) => n.id === 'a')
		expect(mockNode?.implemented).toBeNull()
	})

	it('uses registry when provided', async () => {
		const registry: NodeImplementationRegistry = {
			has: (key) => key === 'mock_node',
		}
		const tool = createCheckNodeImplementationsTool({ registry })
		const result = await tool.execute({ blueprint: mockBlueprint })
		const mockNode = result.data.nodes.find((n) => n.id === 'a')
		const unknownNode = result.data.nodes.find((n) => n.id === 'c')
		expect(mockNode?.implemented).toBe(true)
		expect(unknownNode?.implemented).toBe(false)
	})

	it('counts unimplemented nodes', async () => {
		const registry: NodeImplementationRegistry = {
			has: (key) => key === 'mock_node',
		}
		const tool = createCheckNodeImplementationsTool({ registry })
		const result = await tool.execute({ blueprint: mockBlueprint })
		expect(result.data.unimplementedCount).toBe(1)
		expect(result.data.unknownCount).toBe(0)
	})
})

describe('createAddRetryConfigTool', () => {
	it('adds retry config to specified nodes', async () => {
		const tool = createAddRetryConfigTool()
		const result = await tool.execute({
			blueprint: mockBlueprint,
			nodeIds: ['a'],
			maxRetries: 5,
			retryDelay: 2000,
		})
		const nodeA = result.data.blueprint.nodes.find((n) => n.id === 'a') as unknown as Record<
			string,
			unknown
		>
		expect(nodeA.config).toEqual({ maxRetries: 5, retryDelay: 2000 })
	})

	it('fails for non-existent nodes', async () => {
		const tool = createAddRetryConfigTool()
		const result = await tool.execute({
			blueprint: mockBlueprint,
			nodeIds: ['nonexistent'],
		})
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('NODE_NOT_FOUND')
	})

	it('preserves existing config', async () => {
		const bp = {
			...mockBlueprint,
			nodes: [{ id: 'a', uses: 'mock', config: { timeout: 5000 } }],
		}
		const tool = createAddRetryConfigTool()
		const result = await tool.execute({
			blueprint: bp,
			nodeIds: ['a'],
			maxRetries: 3,
		})
		const nodeA = result.data.blueprint.nodes.find((n) => n.id === 'a') as unknown as Record<
			string,
			unknown
		>
		expect(nodeA.config.timeout).toBe(5000)
		expect(nodeA.config.maxRetries).toBe(3)
	})
})

describe('createAddFallbackNodeTool', () => {
	it('adds fallback node and edge with onError condition', async () => {
		const tool = createAddFallbackNodeTool()
		const result = await tool.execute({
			blueprint: mockBlueprint,
			nodeId: 'a',
			fallbackUses: 'error_handler',
		})
		expect(result.data.fallbackNodeId).toBe('a_fallback')
		const fallbackNode = result.data.blueprint.nodes.find((n) => n.id === 'a_fallback')
		expect(fallbackNode).toBeDefined()
		const fallbackEdge = result.data.blueprint.edges.find(
			(e) =>
				(e as unknown as Record<string, unknown>).source === 'a' &&
				(e as unknown as Record<string, unknown>).target === 'a_fallback',
		)
		expect(fallbackEdge).toBeDefined()
		expect((fallbackEdge as unknown as Record<string, unknown>).condition).toBe('onError')
	})

	it('fails for non-existent target node', async () => {
		const tool = createAddFallbackNodeTool()
		const result = await tool.execute({
			blueprint: mockBlueprint,
			nodeId: 'nonexistent',
			fallbackUses: 'error_handler',
		})
		expect(result.status).toBe('failed')
	})

	it('fails if fallback already exists', async () => {
		const bp = {
			...mockBlueprint,
			nodes: [...mockBlueprint.nodes, { id: 'a_fallback', uses: 'handler' }],
		}
		const tool = createAddFallbackNodeTool()
		const result = await tool.execute({
			blueprint: bp,
			nodeId: 'a',
			fallbackUses: 'error_handler',
		})
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('INVALID_OPERATION')
	})
})

describe('createGetBlueprintDiffTool', () => {
	it('detects added nodes', async () => {
		const tool = createGetBlueprintDiffTool()
		const bpA = { id: 'bp', nodes: [{ id: 'a', uses: 'mock' }], edges: [] }
		const bpB = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			edges: [],
		}
		const result = await tool.execute({ blueprintA: bpA, blueprintB: bpB })
		expect(result.data.hasChanges).toBe(true)
		expect(result.data.addedNodes).toHaveLength(1)
		expect(result.data.addedNodes[0].id).toBe('b')
	})

	it('detects removed nodes', async () => {
		const tool = createGetBlueprintDiffTool()
		const bpA = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			edges: [],
		}
		const bpB = { id: 'bp', nodes: [{ id: 'a', uses: 'mock' }], edges: [] }
		const result = await tool.execute({ blueprintA: bpA, blueprintB: bpB })
		expect(result.data.removedNodes).toHaveLength(1)
	})

	it('detects modified nodes', async () => {
		const tool = createGetBlueprintDiffTool()
		const bpA = { id: 'bp', nodes: [{ id: 'a', uses: 'mock', params: { x: 1 } }], edges: [] }
		const bpB = { id: 'bp', nodes: [{ id: 'a', uses: 'mock', params: { x: 2 } }], edges: [] }
		const result = await tool.execute({ blueprintA: bpA, blueprintB: bpB })
		expect(result.data.modifiedNodes).toHaveLength(1)
		expect(result.data.modifiedNodes[0].changes.params).toBeDefined()
	})

	it('detects added and removed edges', async () => {
		const tool = createGetBlueprintDiffTool()
		const bpA = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			edges: [{ source: 'a', target: 'b' }],
		}
		const bpB = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			edges: [],
		}
		const result = await tool.execute({ blueprintA: bpA, blueprintB: bpB })
		expect(result.data.removedEdges).toHaveLength(1)
	})

	it('returns no changes for identical blueprints', async () => {
		const tool = createGetBlueprintDiffTool()
		const bp = { id: 'bp', nodes: [{ id: 'a', uses: 'mock' }], edges: [] }
		const result = await tool.execute({ blueprintA: bp, blueprintB: bp })
		expect(result.data.hasChanges).toBe(false)
		expect(result.data.summary).toBe('No changes')
	})
})

describe('createSimulateExecutionTool', () => {
	it('predicts linear execution path', async () => {
		const tool = createSimulateExecutionTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			edges: [{ source: 'a', target: 'b' }],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.nodesThatWillExecute).toContain('a')
		expect(result.data.nodesThatWillExecute).toContain('b')
	})

	it('skips nodes with unexecuted predecessors', async () => {
		const tool = createSimulateExecutionTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			edges: [
				{ source: 'a', target: 'b' },
				{ source: 'b', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.nodesThatWillExecute).toContain('a')
	})

	it('respects joinStrategy any', async () => {
		const tool = createSimulateExecutionTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock', config: { joinStrategy: 'any' } },
			],
			edges: [
				{ source: 'a', target: 'c' },
				{ source: 'b', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.nodesThatWillExecute).toContain('c')
	})
})

describe('createOptimizeForParallelismTool', () => {
	it('detects parallel execution levels', async () => {
		const tool = createOptimizeForParallelismTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			edges: [
				{ source: 'a', target: 'b' },
				{ source: 'a', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.maxParallelism).toBeGreaterThanOrEqual(2)
	})

	it('detects orphan nodes', async () => {
		const tool = createOptimizeForParallelismTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			edges: [
				{ source: 'a', target: 'b' },
				{ source: 'c', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.orphans).toContain('c')
	})

	it('suggests improvements for sequential workflows', async () => {
		const tool = createOptimizeForParallelismTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			edges: [
				{ source: 'a', target: 'b' },
				{ source: 'b', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.suggestions.length).toBeGreaterThan(0)
	})

	it('detects fan-out nodes', async () => {
		const tool = createOptimizeForParallelismTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			edges: [
				{ source: 'a', target: 'b' },
				{ source: 'a', target: 'c' },
			],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.fanOutNodes.length).toBeGreaterThan(0)
	})
})

describe('createCheckDataFlowTool', () => {
	it('maps data flow between connected nodes', async () => {
		const tool = createCheckDataFlowTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock', inputs: { x: 'a.result' } },
			],
			edges: [{ source: 'a', target: 'b' }],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.dataFlowMap).toHaveLength(1)
		expect(result.data.dataFlowMap[0].inputMapping).toEqual({ x: 'a.result' })
	})

	it('warns about internal context key references', async () => {
		const tool = createCheckDataFlowTool()
		const bp = {
			id: 'bp',
			nodes: [
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock', inputs: { x: '_executionId' } },
			],
			edges: [{ source: 'a', target: 'b' }],
		}
		const result = await tool.execute({ blueprint: bp })
		expect(result.data.issues.some((i) => i.severity === 'warning')).toBe(true)
	})
})

describe('createGenerateFromTemplateTool', () => {
	const mockTemplates: TemplateStore = {
		get: (name) =>
			name === 'simple'
				? {
						id: 'template-bp',
						nodes: [{ id: 'step1', uses: 'mock', params: { purpose: 'test' } }],
						edges: [],
						metadata: { version: '1.0' },
					}
				: undefined,
		list: () => ['simple'],
	}

	it('generates blueprint from template', async () => {
		const tool = createGenerateFromTemplateTool({ templates: mockTemplates })
		const result = await tool.execute({ template: 'simple' })
		expect(result.data.blueprint.id).toBe('template-bp')
		expect(result.data.template).toBe('simple')
	})

	it('fails for unknown template', async () => {
		const tool = createGenerateFromTemplateTool({ templates: mockTemplates })
		const result = await tool.execute({ template: 'nonexistent' })
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('TEMPLATE_NOT_FOUND')
	})

	it('applies parameter overrides', async () => {
		const tool = createGenerateFromTemplateTool({ templates: mockTemplates })
		const result = await tool.execute({
			template: 'simple',
			params: { purpose: 'overridden' },
		})
		expect(result.data.appliedOverrides).toContain('purpose')
	})
})
