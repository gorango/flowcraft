import type { WorkflowBlueprint } from '../src/types'
import { describe, expect, it } from 'vitest'
import { analyzeBlueprint, checkForCycles, generateMermaid } from '../src/analysis'

describe('Graph Analysis', () => {
	describe('checkForCycles', () => {
		it('should return an empty array for a valid DAG', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'C' },
				],
			}
			const cycles = checkForCycles(blueprint)
			expect(cycles).toEqual([])
		})

		it('should detect a simple two-node cycle', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'A' },
				],
			}
			const cycles = checkForCycles(blueprint)
			expect(cycles).toHaveLength(1)
			expect(cycles[0]).toEqual(['A', 'B', 'A'])
		})

		it('should detect a longer self-referencing cycle', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'C' },
					{ source: 'C', target: 'A' },
				],
			}
			const cycles = checkForCycles(blueprint)
			expect(cycles).toHaveLength(1)
			expect(cycles[0]).toEqual(['A', 'B', 'C', 'A'])
		})
	})

	describe('analyzeBlueprint', () => {
		it('should correctly identify start nodes (no incoming edges)', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'C' },
				],
			}
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.startNodeIds).toEqual(['A'])
			expect(analysis.terminalNodeIds).toEqual(['C'])
			expect(analysis.isDag).toBe(true)
		})

		it('should correctly identify terminal nodes (no outgoing edges)', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'A', target: 'C' },
				],
			}
			const analysis = analyzeBlueprint(blueprint)
			expect(analysis.startNodeIds).toEqual(['A'])
			expect(analysis.terminalNodeIds).toEqual(['B', 'C'])
			expect(analysis.isDag).toBe(true)
		})

		it('should report isDag=true for a DAG and false for a graph with cycles', () => {
			const dagBlueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
				],
			}
			const cycleBlueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'A' },
				],
			}
			expect(analyzeBlueprint(dagBlueprint).isDag).toBe(true)
			expect(analyzeBlueprint(cycleBlueprint).isDag).toBe(false)
		})
	})

	describe('generateMermaid', () => {
		it('should generate a correct graph for a simple linear flow', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
				],
			}
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('flowchart TD')
			expect(mermaid).toContain('A["A"]')
			expect(mermaid).toContain('B["B"]')
			expect(mermaid).toContain('A --> B')
		})

		it('should add labels for edges with actions or conditions', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B', action: 'success', condition: 'status == "ok"' },
				],
			}
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('A -- "success | status == "ok"" --> B')
		})

		it('should correctly render a diamond-shaped (fan-out/fan-in) graph', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
					{ id: 'D', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'A', target: 'C' },
					{ source: 'B', target: 'D' },
					{ source: 'C', target: 'D' },
				],
			}
			const mermaid = generateMermaid(blueprint)
			expect(mermaid).toContain('A["A"]')
			expect(mermaid).toContain('B["B"]')
			expect(mermaid).toContain('C["C"]')
			expect(mermaid).toContain('D["D"]')
			expect(mermaid).toContain('A --> B')
			expect(mermaid).toContain('A --> C')
			expect(mermaid).toContain('B --> D')
			expect(mermaid).toContain('C --> D')
		})
	})
})
