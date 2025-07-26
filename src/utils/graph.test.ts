import type { WorkflowGraph } from '../builder/graph.types'
import { describe, expect, it } from 'vitest'
import { analyzeGraph, checkForCycles, createNodeRule } from './graph'

describe('testGraphAnalysis', () => {
	describe('analyzeGraph', () => {
		it('should correctly analyze a simple linear graph', () => {
			const graph: WorkflowGraph = {
				nodes: [{ id: 'a', type: 'start' }, { id: 'b', type: 'end' }],
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
			const graph: WorkflowGraph = {
				// @ts-expect-error irl needs types
				nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
				edges: [{ source: 'a', target: 'c' }, { source: 'b', target: 'c' }],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.startNodeIds).toEqual(expect.arrayContaining(['a', 'b']))
			expect(analysis.nodes.get('c')?.inDegree).toBe(2)
		})

		it('should correctly identify a simple cycle', () => {
			const graph: WorkflowGraph = {
				// @ts-expect-error irl needs types
				nodes: [{ id: 'a' }, { id: 'b' }],
				edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.cycles.length).toBeGreaterThan(0)
			expect(analysis.cycles).toContainEqual(['a', 'b', 'a'])
		})

		it('should identify a more complex cycle', () => {
			const graph: WorkflowGraph = {
				// @ts-expect-error irl needs types
				nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
				edges: [
					{ source: 'a', target: 'b' },
					{ source: 'b', target: 'c' },
					{ source: 'c', target: 'd' },
					{ source: 'd', target: 'b' }, // Back edge
				],
			}
			const analysis = analyzeGraph(graph)
			expect(analysis.cycles).toEqual([['b', 'c', 'd', 'b']])
		})

		it('should handle an empty graph', () => {
			const graph: WorkflowGraph = { nodes: [], edges: [] }
			const analysis = analyzeGraph(graph)
			expect(analysis.allNodeIds).toEqual([])
			expect(analysis.startNodeIds).toEqual([])
			expect(analysis.nodes.size).toBe(0)
		})
	})

	describe('createNodeRule and Validator checks', () => {
		const graph: WorkflowGraph = {
			nodes: [
				{ id: 'start', type: 'start' },
				{ id: 'process', type: 'process' },
				{ id: 'output', type: 'output' },
				{ id: 'orphan', type: 'orphan' },
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

		it('should create a rule that finds orphaned nodes', () => {
			const rule = createNodeRule(
				'No orphaned nodes',
				_node => true,
				node => ({
					valid: node.inDegree > 0 || node.outDegree > 0,
					message: `Node '${node.id}' is orphaned.`,
				}),
			)
			// Re-run analysis on a graph with a true orphan
			// @ts-expect-error irl needs types
			const orphanGraph: WorkflowGraph = { nodes: [{ id: 'a' }], edges: [] }
			const orphanAnalysis = analyzeGraph(orphanGraph)
			const errors = rule(orphanAnalysis, orphanGraph)
			expect(errors).toHaveLength(1)
			expect(errors[0].nodeId).toBe('a')
		})

		it('should return no errors for a valid node', () => {
			const rule = createNodeRule(
				'Start must be a start node',
				node => node.type === 'start',
				node => ({ valid: node.inDegree === 0 }),
			)
			const errors = rule(analysis, graph)
			expect(errors).toHaveLength(0)
		})
	})

	describe('checkForCycles validator', () => {
		it('should return a validation error for each detected cycle', () => {
			const graph: WorkflowGraph = {
				// @ts-expect-error irl needs types
				nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
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

		it('should return an empty array for an acyclic graph', () => {
			const graph: WorkflowGraph = {
				// @ts-expect-error irl needs types
				nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
				edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
			}
			const analysis = analyzeGraph(graph)
			const errors = checkForCycles(analysis, graph)
			expect(errors).toHaveLength(0)
		})
	})
})
