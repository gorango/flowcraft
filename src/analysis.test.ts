import { describe, expect, it } from 'vitest'
import { analyzeBlueprint, checkForCycles, generateMermaid } from './analysis'
import { createFlow } from './flow'

describe('Graph Analysis', () => {
	describe('checkForCycles', () => {
		it('should return an empty array for a simple linear graph', () => {
			const flow = createFlow('linear')
			flow.node('a', 'func').node('b', 'func').edge('a', 'b')
			const blueprint = flow.toBlueprint()
			const cycles = checkForCycles(blueprint)
			expect(cycles).toEqual([])
		})

		it('should return an empty array for a DAG with fan-in/fan-out', () => {
			const flow = createFlow('dag')
			flow.node('a', 'f').node('b', 'f').node('c', 'f').node('d', 'f')
			flow.edge('a', 'b').edge('a', 'c').edge('b', 'd').edge('c', 'd')
			const blueprint = flow.toBlueprint()
			const cycles = checkForCycles(blueprint)
			expect(cycles).toEqual([])
		})

		it('should detect a simple two-node cycle', () => {
			const flow = createFlow('simple-cycle')
			flow.node('a', 'f').node('b', 'f').edge('a', 'b').edge('b', 'a')
			const blueprint = flow.toBlueprint()
			const cycles = checkForCycles(blueprint)
			expect(cycles).toHaveLength(1)
			expect(cycles[0]).toEqual(['a', 'b', 'a'])
		})

		it('should detect a longer three-node cycle', () => {
			const flow = createFlow('long-cycle')
			flow.node('a', 'f').node('b', 'f').node('c', 'f')
			flow.edge('a', 'b').edge('b', 'c').edge('c', 'a')
			const blueprint = flow.toBlueprint()
			const cycles = checkForCycles(blueprint)
			expect(cycles).toHaveLength(1)
			expect(cycles[0]).toEqual(['a', 'b', 'c', 'a'])
		})

		it('should detect a self-referencing node cycle', () => {
			const flow = createFlow('self-cycle')
			flow.node('a', 'f').edge('a', 'a')
			const blueprint = flow.toBlueprint()
			const cycles = checkForCycles(blueprint)
			expect(cycles).toHaveLength(1)
			expect(cycles[0]).toEqual(['a', 'a'])
		})
	})

	describe('generateMermaid', () => {
		it('should correctly render a simple A -> B graph', () => {
			const flow = createFlow('simple')
			flow.node('a', 'func').node('b', 'func').edge('a', 'b')
			const blueprint = flow.toBlueprint()
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('flowchart TD')
			expect(mermaid).toContain('a["a"]')
			expect(mermaid).toContain('b["b"]')
			expect(mermaid).toContain('a --> b')
		})

		it('should add labels for conditional edges', () => {
			const flow = createFlow('conditional')
			flow.node('a', 'func').node('b', 'func').node('c', 'func')
			flow.edge('a', 'b', { condition: 'success' })
			flow.edge('a', 'c', { action: 'error' })
			const blueprint = flow.toBlueprint()
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('a -- "success" --> b')
			expect(mermaid).toContain('a -- "error" --> c')
		})

		it('should correctly render fan-out and fan-in (diamond shape)', () => {
			const flow = createFlow('diamond')
			flow.node('start', 'func').node('branch1', 'func').node('branch2', 'func').node('end', 'func')
			flow.edge('start', 'branch1').edge('start', 'branch2')
			flow.edge('branch1', 'end').edge('branch2', 'end')
			const blueprint = flow.toBlueprint()
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('start --> branch1')
			expect(mermaid).toContain('start --> branch2')
			expect(mermaid).toContain('branch1 --> end')
			expect(mermaid).toContain('branch2 --> end')
		})

		it('should handle blueprints with no edges (disconnected nodes)', () => {
			const flow = createFlow('disconnected')
			flow.node('a', 'func').node('b', 'func').node('c', 'func')
			const blueprint = flow.toBlueprint()
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('a["a"]')
			expect(mermaid).toContain('b["b"]')
			expect(mermaid).toContain('c["c"]')
			expect(mermaid).not.toContain('-->')
		})

		it('should return a valid empty graph for a blueprint with no edges', () => {
			const flow = createFlow('empty')
			flow.node('a', 'func')
			const blueprint = flow.toBlueprint()
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('flowchart TD')
			expect(mermaid).toContain('a["a"]')
			expect(mermaid).not.toContain('-->')
		})
	})

	describe('analyzeBlueprint', () => {
		it('should return an empty array for a valid DAG', () => {
			const flow = createFlow('valid-dag')
			flow.node('a', 'func').node('b', 'func').node('c', 'func')
			flow.edge('a', 'b').edge('b', 'c')
			const blueprint = flow.toBlueprint()
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.cycles).toEqual([])
			expect(analysis.isDag).toBe(true)
			expect(analysis.startNodeIds).toEqual(['a'])
			expect(analysis.terminalNodeIds).toEqual(['c'])
			expect(analysis.nodeCount).toBe(3)
			expect(analysis.edgeCount).toBe(2)
		})

		it('should detect a simple A -> B -> A cycle', () => {
			const flow = createFlow('simple-cycle')
			flow.node('a', 'func').node('b', 'func')
			flow.edge('a', 'b').edge('b', 'a')
			const blueprint = flow.toBlueprint()
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.cycles).toHaveLength(1)
			expect(analysis.cycles[0]).toEqual(['a', 'b', 'a'])
			expect(analysis.isDag).toBe(false)
			expect(analysis.startNodeIds).toEqual([])
			expect(analysis.terminalNodeIds).toEqual([])
			expect(analysis.nodeCount).toBe(2)
			expect(analysis.edgeCount).toBe(2)
		})

		it('should detect a self-referencing edge (A -> A) as a cycle', () => {
			const flow = createFlow('self-cycle')
			flow.node('a', 'func').edge('a', 'a')
			const blueprint = flow.toBlueprint()
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.cycles).toHaveLength(1)
			expect(analysis.cycles[0]).toEqual(['a', 'a'])
			expect(analysis.isDag).toBe(false)
			expect(analysis.startNodeIds).toEqual([])
			expect(analysis.terminalNodeIds).toEqual([])
			expect(analysis.nodeCount).toBe(1)
			expect(analysis.edgeCount).toBe(1)
		})

		it('should correctly identify multiple start nodes', () => {
			const flow = createFlow('multiple-starts')
			flow.node('a', 'func').node('b', 'func').node('c', 'func').node('d', 'func')
			flow.edge('a', 'c').edge('b', 'c').edge('c', 'd')
			const blueprint = flow.toBlueprint()
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.startNodeIds).toEqual(['a', 'b'])
			expect(analysis.terminalNodeIds).toEqual(['d'])
			expect(analysis.cycles).toEqual([])
			expect(analysis.isDag).toBe(true)
		})

		it('should correctly identify terminal nodes (nodes with no outgoing edges)', () => {
			const flow = createFlow('terminal-nodes')
			flow.node('a', 'func').node('b', 'func').node('c', 'func').node('d', 'func')
			flow.edge('a', 'b').edge('a', 'c').edge('b', 'd')
			const blueprint = flow.toBlueprint()
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.startNodeIds).toEqual(['a'])
			expect(analysis.terminalNodeIds).toEqual(['c', 'd'])
			expect(analysis.cycles).toEqual([])
			expect(analysis.isDag).toBe(true)
		})
	})
})
