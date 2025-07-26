import type { NodeTypeMap, TypedWorkflowGraph } from '../builder/graph.types'
import { describe, expect, it } from 'vitest'
import { analyzeGraph, checkForCycles, createNodeRule } from './graph'

describe('testGraphAnalysis', () => {
	describe('analyzeGraph', () => {
		it('should correctly analyze a simple linear graph', () => {
			const graph: TypedWorkflowGraph<{ start: Record<string, never>, end: Record<string, never> }> = {
				nodes: [{ id: 'a', type: 'start', data: {} }, { id: 'b', type: 'end', data: {} }],
				edges: [{ source: 'a', target: 'b' }],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.allNodeIds).toEqual(['a', 'b'])
			expect(analysis.startNodeIds).toEqual(['a'])
			expect(analysis.nodes.get('a')?.outDegree).toBe(1)
			expect(analysis.nodes.get('a')?.inDegree).toBe(0)
			expect(analysis.nodes.get('b')?.outDegree).toBe(0)
			expect(analysis.nodes.get('b')?.inDegree).toBe(1)
			expect(analysis.cycles).toEqual([])
		})

		it('should identify multiple start nodes', () => {
			const graph: TypedWorkflowGraph<any> = {
				nodes: [{ id: 'a', type: 'input', data: {} }, { id: 'b', type: 'input', data: {} }, { id: 'c', type: 'process', data: {} }],
				edges: [{ source: 'a', target: 'c' }, { source: 'b', target: 'c' }],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.startNodeIds).toEqual(expect.arrayContaining(['a', 'b']))
			expect(analysis.nodes.get('c')?.inDegree).toBe(2)
		})

		it('should correctly identify a simple cycle', () => {
			const graph: TypedWorkflowGraph<any> = {
				nodes: [{ id: 'a', type: 'process', data: {} }, { id: 'b', type: 'process', data: {} }],
				edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.cycles.length).toBeGreaterThan(0)
			expect(analysis.cycles).toContainEqual(['a', 'b', 'a'])
		})

		it('should handle an empty graph', () => {
			const graph: TypedWorkflowGraph<any> = { nodes: [], edges: [] }
			const analysis = analyzeGraph(graph)
			expect(analysis.allNodeIds).toEqual([])
			expect(analysis.startNodeIds).toEqual([])
			expect(analysis.nodes.size).toBe(0)
		})
	})

	describe('createNodeRule and Validator checks', () => {
		const graph: TypedWorkflowGraph<any> = {
			nodes: [
				{ id: 'start', type: 'start', data: {} },
				{ id: 'process', type: 'process', data: {} },
				{ id: 'output', type: 'output', data: {} },
				{ id: 'orphan', type: 'orphan', data: {} },
			],
			edges: [
				{ source: 'start', target: 'process' },
				{ source: 'process', target: 'output' },
				{ source: 'output', target: 'orphan' }, // Invalid edge
			],
		}
		const analysis = analyzeGraph(graph)

		it('should create a rule that finds nodes with invalid out-degrees', () => {
			const rule = createNodeRule(
				'Output must be terminal',
				node => node.type === 'output',
				node => ({
					valid: node.outDegree === 0,
					message: `Output node '${node.id}' cannot have outgoing connections.`,
				}),
			)
			const errors = rule(analysis, graph)
			expect(errors).toHaveLength(1)
			expect(errors[0].nodeId).toBe('output')
			expect(errors[0].message).toContain('cannot have outgoing connections')
		})
	})

	describe('checkForCycles validator', () => {
		it('should return a validation error for each detected cycle', () => {
			const graph: TypedWorkflowGraph<any> = {
				nodes: [{ id: 'a', type: 'step', data: {} }, { id: 'b', type: 'step', data: {} }, { id: 'c', type: 'step', data: {} }],
				edges: [
					{ source: 'a', target: 'b' },
					{ source: 'b', target: 'c' },
					{ source: 'c', target: 'a' },
				],
			}
			const analysis = analyzeGraph(graph)
			const errors = checkForCycles(analysis, graph)
			expect(errors).toHaveLength(1)
			expect(errors[0].type).toBe('CycleDetected')
			expect(errors[0].message).toContain('a -> b -> c -> a')
		})
	})

	describe('type-Safe Validation with NodeTypeMap', () => {
		// 1. Define a custom, type-safe map for our test nodes.
		interface TestNodeTypeMap extends NodeTypeMap {
			'api-call': { url: string, retries: number }
			'data-transform': { mode: 'uppercase' | 'lowercase' }
		}

		// 2. Create a graph that uses this specific type map.
		const typedGraph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'fetch-user', type: 'api-call', data: { url: '/users/1', retries: 3 } }, // Valid
				{ id: 'fetch-products', type: 'api-call', data: { url: '/products', retries: 0 } }, // Invalid retries
				{ id: 'format-name', type: 'data-transform', data: { mode: 'uppercase' } },
			],
			edges: [],
		}

		it('should allow type-safe access to the data property in a rule', () => {
			// 3. Create a type-safe rule that inspects the `data` property.
			const rule = createNodeRule<TestNodeTypeMap>(
				'API calls must have retries',
				// The `node` is correctly typed here as a union of our specific node types
				node => node.type === 'api-call',
				// The `node` here is narrowed to just the 'api-call' type!
				(node) => {
					// `node.data.retries` is fully typed as `number` and autocompletes.
					const valid = node.data.retries > 0
					return {
						valid,
						message: `API call node '${node.id}' must have at least 1 retry.`,
					}
				},
			)

			const analysis = analyzeGraph(typedGraph)
			const errors = rule(analysis, typedGraph)

			// 4. Assert that only the invalid node was caught.
			expect(errors).toHaveLength(1)
			expect(errors[0].nodeId).toBe('fetch-products')
			expect(errors[0].message).toContain('must have at least 1 retry')
		})
	})
})
