import { describe, expect, it } from 'vitest'
import { analyzeBlueprint, checkForCycles, generateMermaid, generateMermaidForRun } from '../src/analysis'
import { FlowcraftError } from '../src/errors'
import type { FlowcraftEvent, WorkflowBlueprint } from '../src/types'

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
				edges: [{ source: 'A', target: 'B' }],
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
				edges: [{ source: 'A', target: 'B' }],
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
					{
						source: 'A',
						target: 'B',
						action: 'success',
						condition: 'status == "ok"',
					},
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

	describe('generateMermaidForRun', () => {
		it('should generate a graph with successful node styling', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [{ source: 'A', target: 'B' }],
			}
			const events: FlowcraftEvent[] = [
				{
					type: 'node:finish',
					payload: { nodeId: 'A', result: { output: 'success' }, executionId: 'test', blueprintId: 'test' },
				},
			]
			const mermaid = generateMermaidForRun(blueprint, events)
			expect(mermaid).toContain('flowchart TD')
			expect(mermaid).toContain('A["A"]')
			expect(mermaid).toContain('B["B"]')
			expect(mermaid).toContain('A --> B')
			expect(mermaid).toContain('style A fill:#d4edda,stroke:#c3e6cb')
			expect(mermaid).not.toContain('style B')
		})

		it('should generate a graph with failed node styling', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [{ source: 'A', target: 'B' }],
			}
			const events: FlowcraftEvent[] = [
				{
					type: 'node:error',
					payload: {
						nodeId: 'A',
						error: new FlowcraftError('fail', { isFatal: true }),
						executionId: 'test',
						blueprintId: 'test',
					},
				},
			]
			const mermaid = generateMermaidForRun(blueprint, events)
			expect(mermaid).toContain('style A fill:#f8d7da,stroke:#f5c6cb')
			expect(mermaid).not.toContain('style B')
		})

		it('should generate a graph with taken edge styling', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [{ source: 'A', target: 'B' }],
			}
			const events: FlowcraftEvent[] = [
				{ type: 'edge:evaluate', payload: { source: 'A', target: 'B', condition: 'true', result: true } },
			]
			const mermaid = generateMermaidForRun(blueprint, events)
			expect(mermaid).toContain('linkStyle 0 stroke:#007bff,stroke-width:3px')
		})

		it('should handle multiple events correctly', () => {
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
			const events: FlowcraftEvent[] = [
				{
					type: 'node:finish',
					payload: { nodeId: 'A', result: { output: 'success' }, executionId: 'test', blueprintId: 'test' },
				},
				{
					type: 'node:error',
					payload: {
						nodeId: 'B',
						error: new FlowcraftError('fail', { isFatal: true }),
						executionId: 'test',
						blueprintId: 'test',
					},
				},
				{ type: 'edge:evaluate', payload: { source: 'A', target: 'B', condition: 'true', result: true } },
			]
			const mermaid = generateMermaidForRun(blueprint, events)
			expect(mermaid).toContain('style A fill:#d4edda,stroke:#c3e6cb')
			expect(mermaid).toContain('style B fill:#f8d7da,stroke:#f5c6cb')
			expect(mermaid).toContain('linkStyle 0 stroke:#007bff,stroke-width:3px')
			expect(mermaid).not.toContain('linkStyle 1')
		})
	})
})
