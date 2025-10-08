import { describe, expect, it } from 'vitest'
import { checkForCycles } from './analysis.js'
import { createFlow } from './flow.js'

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
})
