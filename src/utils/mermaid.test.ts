import type { AbstractNode } from '../workflow'
import { describe, expect, it } from 'vitest'
import { ParallelFlow } from '../builder'
import { DEFAULT_ACTION, FILTER_FAILED } from '../types'
import { Flow, Node } from '../workflow'
import { generateMermaidGraph } from './mermaid'

// Define simple, named node classes to make test assertions clearer.
class StartNode extends Node { }
class ProcessNode extends Node { }
class EndNode extends Node { }
class DecisionNode extends Node { }
class PathANode extends Node { }
class PathBNode extends Node { }
class PathCNode extends Node { } // For 3-way branch test
class FailureNode extends Node { }
class TopNode extends Node { } // For diamond test
class LeftNode extends Node { } // For diamond test
class RightNode extends Node { } // For diamond test
class BottomNode extends Node { } // For diamond test

describe('testGenerateMermaidGraph', () => {
	it('should generate a correct graph for a simple linear flow', () => {
		const startNode = new StartNode()
		const processNode = new ProcessNode()
		const endNode = new EndNode()
		startNode.next(processNode).next(endNode)
		const flow = new Flow(startNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('graph TD')
		expect(result).toContain('StartNode_0[StartNode]')
		expect(result).toContain('ProcessNode_0[ProcessNode]')
		expect(result).toContain('EndNode_0[EndNode]')
		expect(result).toContain('StartNode_0 --> ProcessNode_0')
		expect(result).toContain('ProcessNode_0 --> EndNode_0')
	})

	it('should handle conditional branching with custom string actions', () => {
		const decisionNode = new DecisionNode()
		const pathANode = new PathANode()
		const pathBNode = new PathBNode()
		decisionNode.next(pathANode, 'action_a')
		decisionNode.next(pathBNode, 'action_b')
		const flow = new Flow(decisionNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('DecisionNode_0[DecisionNode]')
		expect(result).toContain('PathANode_0[PathANode]')
		expect(result).toContain('PathBNode_0[PathBNode]')
		expect(result).toContain('DecisionNode_0 -- "action_a" --> PathANode_0')
		expect(result).toContain('DecisionNode_0 -- "action_b" --> PathBNode_0')
	})

	it('should use special labels for FILTER_FAILED and DEFAULT_ACTION', () => {
		const decisionNode = new DecisionNode()
		const pathANode = new PathANode()
		const failureNode = new FailureNode()
		decisionNode.next(pathANode, DEFAULT_ACTION)
		decisionNode.next(failureNode, FILTER_FAILED)
		const flow = new Flow(decisionNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('DecisionNode_0 --> PathANode_0')
		expect(result).toContain('DecisionNode_0 -- "filter failed" --> FailureNode_0')
	})

	it('should correctly represent a flow with a cycle', () => {
		const startNode = new StartNode()
		const processNode = new ProcessNode()
		startNode.next(processNode)
		processNode.next(startNode) // Loop back
		const flow = new Flow(startNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('StartNode_0[StartNode]')
		expect(result).toContain('ProcessNode_0[ProcessNode]')
		expect(result).toContain('StartNode_0 --> ProcessNode_0')
		expect(result).toContain('ProcessNode_0 --> StartNode_0')
	})

	it('should handle multiple nodes fanning into a single node', () => {
		const decisionNode = new DecisionNode()
		const pathANode = new PathANode()
		const pathBNode = new PathBNode()
		const endNode = new EndNode()
		decisionNode.next(pathANode, 'a')
		decisionNode.next(pathBNode, 'b')
		pathANode.next(endNode)
		pathBNode.next(endNode)
		const flow = new Flow(decisionNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('PathANode_0 --> EndNode_0')
		expect(result).toContain('PathBNode_0 --> EndNode_0')
	})

	it('should return a minimal graph for a flow with only a single node', () => {
		const flow = new Flow(new StartNode())
		const result = generateMermaidGraph(flow)
		expect(result).toBe('graph TD\n  StartNode_0[StartNode]')
	})

	it('should return an empty graph definition for an empty flow', () => {
		const flow = new Flow() // No start node
		const result = generateMermaidGraph(flow)
		expect(result).toBe('graph TD\n  %% Empty Flow')
	})

	it('should generate unique names for multiple instances of the same node class', () => {
		const startNode = new ProcessNode()
		const middleNode = new ProcessNode()
		const endNode = new ProcessNode()
		startNode.next(middleNode).next(endNode)
		const flow = new Flow(startNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('ProcessNode_0[ProcessNode]')
		expect(result).toContain('ProcessNode_1[ProcessNode]')
		expect(result).toContain('ProcessNode_2[ProcessNode]')
		expect(result).toContain('ProcessNode_0 --> ProcessNode_1')
		expect(result).toContain('ProcessNode_1 --> ProcessNode_2')
	})

	it('should correctly render a diamond-shaped graph', () => {
		const top = new TopNode()
		const left = new LeftNode()
		const right = new RightNode()
		const bottom = new BottomNode()
		top.next(left, 'go_left')
		top.next(right, 'go_right')
		left.next(bottom)
		right.next(bottom)
		const flow = new Flow(top)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('TopNode_0 -- "go_left" --> LeftNode_0')
		expect(result).toContain('TopNode_0 -- "go_right" --> RightNode_0')
		expect(result).toContain('LeftNode_0 --> BottomNode_0')
		expect(result).toContain('RightNode_0 --> BottomNode_0')
	})

	it('should handle a node with three or more branches', () => {
		const decision = new DecisionNode()
		const pathA = new PathANode()
		const pathB = new PathBNode()
		const pathC = new PathCNode()
		decision.next(pathA, 'a')
		decision.next(pathB, 'b')
		decision.next(pathC, 'c')
		const flow = new Flow(decision)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('DecisionNode_0 -- "a" --> PathANode_0')
		expect(result).toContain('DecisionNode_0 -- "b" --> PathBNode_0')
		expect(result).toContain('DecisionNode_0 -- "c" --> PathCNode_0')
	})

	it('should handle a branch that leads to another branch (multi-level)', () => {
		const root = new DecisionNode()
		const branchA = new PathANode() // Terminal branch
		const branchB = new DecisionNode() // This branch also branches
		const leafA = new EndNode()
		const leafB1 = new EndNode()
		const leafB2 = new EndNode()
		root.next(branchA, 'path_a')
		root.next(branchB, 'path_b')
		branchA.next(leafA)
		branchB.next(leafB1, 'sub_b1')
		branchB.next(leafB2, 'sub_b2')
		const flow = new Flow(root)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('DecisionNode_0 -- "path_a" --> PathANode_0')
		expect(result).toContain('DecisionNode_0 -- "path_b" --> DecisionNode_1')
		expect(result).toContain('PathANode_0 --> EndNode_0')
		expect(result).toContain('DecisionNode_1 -- "sub_b1" --> EndNode_1')
		expect(result).toContain('DecisionNode_1 -- "sub_b2" --> EndNode_2')
	})

	it('should handle a branch that loops while another terminates', () => {
		const decision = new DecisionNode()
		const loopNode = new ProcessNode()
		const endNode = new EndNode()
		decision.next(loopNode, 'continue')
		decision.next(endNode, 'finish')
		loopNode.next(decision) // Loop back to the decision
		const flow = new Flow(decision)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('DecisionNode_0 -- "continue" --> ProcessNode_0')
		expect(result).toContain('DecisionNode_0 -- "finish" --> EndNode_0')
		expect(result).toContain('ProcessNode_0 --> DecisionNode_0')
	})
})

describe('testGraphBuilderGraphs', () => {
	class ParallelBranchContainer extends ParallelFlow {
		public readonly isParallelContainer = true
		constructor(public readonly nodesToRun: AbstractNode[]) { super(nodesToRun) }
	}
	it('should generate descriptive labels using node.graphData', () => {
		const nodeA = new Node().withGraphData({ id: 'start-node', type: 'llm-process' })
		const nodeB = new Node().withGraphData({ id: 'end-node', type: 'output' })
		nodeA.next(nodeB)
		const flow = new Flow(nodeA)
		const result = generateMermaidGraph(flow)

		expect(result).toContain('startnode_0["start-node (llm-process)"]')
		expect(result).toContain('endnode_0["end-node (output)"]')
		expect(result).toContain('startnode_0 --> endnode_0')
	})

	it('should generate special labels for parallel containers and mappers', () => {
		const start = new Node().withGraphData({ id: 'start', type: 'start-type' })
		const branchA = new Node().withGraphData({ id: 'branch-a', type: 'type-a' })
		const branchB = new Node().withGraphData({ id: 'branch-b', type: 'type-b' })
		const parallel = new ParallelBranchContainer([branchA, branchB])
		const finalNode = new Node().withGraphData({ id: 'final', type: 'end-type' })

		// This is how the GraphBuilder wires the flow
		start.next(parallel)
		branchA.next(finalNode) // Internal node fans out
		branchB.next(finalNode) // Internal node fans out

		const flow = new Flow(start)
		const result = generateMermaidGraph(flow)

		// Check for container label
		expect(result).toContain('ParallelBlock_0{Parallel Block}')
		// Check for fan-out from container
		expect(result).toContain('start_0 --> ParallelBlock_0')
		expect(result).toContain('ParallelBlock_0 --> brancha_0')
		expect(result).toContain('ParallelBlock_0 --> branchb_0')
		// Check for fan-in to final node
		expect(result).toContain('brancha_0 --> final_0')
		expect(result).toContain('branchb_0 --> final_0')
	})

	it('should get original ID from graphData, ignoring prefixes', () => {
		// Simulates a node from an inlined sub-workflow
		const inlinedNode = new Node().withGraphData({
			id: 'parent:child-node',
			type: 'child-type',
		})
		const flow = new Flow(inlinedNode)
		const result = generateMermaidGraph(flow)
		expect(result).toContain('childnode_0["child-node (child-type)"]')
	})
})
