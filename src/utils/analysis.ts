import type { GraphNode, NodeTypeMap, TypedGraphNode, TypedWorkflowGraph, WorkflowGraph } from '../builder/graph.types'

/** The rich metadata object returned by the analyzeGraph function. */
export interface GraphAnalysis<T extends NodeTypeMap = any> {
	/** A map of all nodes, keyed by ID, augmented with their connection degrees. */
	nodes: Map<string, TypedGraphNode<T> & { inDegree: number, outDegree: number }>
	/** An array of all node IDs in the graph. */
	allNodeIds: string[]
	/** An array of node IDs that have no incoming edges. */
	startNodeIds: string[]
	/** A list of cycles found in the graph. Each cycle is an array of node IDs. */
	cycles: string[][]
}

/** A standard structure for reporting a single validation error. */
export interface ValidationError {
	/** The ID of the node where the error occurred, if applicable. */
	nodeId?: string
	/** A category for the error, e.g., 'CycleDetected', 'ConnectionRuleViolation'. */
	type: string
	/** A human-readable message explaining the validation failure. */
	message: string
}

/**
 * A function that takes a graph analysis and the original graph,
 * and returns an array of validation errors.
 */
export type Validator<T extends NodeTypeMap = any> = (
	analysis: GraphAnalysis<T>,
	graph: TypedWorkflowGraph<T>
) => ValidationError[]

/**
 * A helper function that creates a type guard for filtering nodes by their type.
 * This simplifies writing type-safe validation rules by removing the need for
 * verbose, explicit type guard syntax.
 *
 * @param type The literal string of the node type to check for.
 * @returns A type guard function that narrows the node to its specific type.
 */
export function isNodeType<T extends NodeTypeMap, K extends keyof T>(type: K) {
	return (node: TypedGraphNode<T>): node is TypedGraphNode<T> & { type: K } => {
		return node.type === type
	}
}

/**
 * Analyzes a declarative workflow graph definition to extract structural metadata.
 * This is a lightweight, static utility that does not instantiate any nodes.
 *
 * @param graph The WorkflowGraph object containing nodes and edges.
 * @returns A GraphAnalysis object containing nodes with degree counts, start nodes, and any cycles.
 */
// (Typesafe Overload) Analyzes a declarative workflow graph, preserving strong types.
export function analyzeGraph<T extends NodeTypeMap>(graph: TypedWorkflowGraph<T>): GraphAnalysis<T>
// (Untyped Overload) Analyzes a declarative workflow graph with basic types.
export function analyzeGraph(graph: WorkflowGraph): GraphAnalysis
// (Implementation) Analyzes a declarative workflow graph to extract structural metadata.
export function analyzeGraph<T extends NodeTypeMap>(graph: TypedWorkflowGraph<T> | WorkflowGraph): GraphAnalysis<T> {
	const typedGraph = graph as TypedWorkflowGraph<T> // Cast for internal consistency
	const analysis: GraphAnalysis<T> = {
		nodes: new Map(),
		allNodeIds: [],
		startNodeIds: [],
		cycles: [],
	}

	if (!typedGraph || !typedGraph.nodes || !typedGraph.nodes.length)
		return analysis

	const allNodeIds = typedGraph.nodes.map(node => node.id)
	analysis.allNodeIds = allNodeIds

	const adj: Map<string, string[]> = new Map()
	typedGraph.nodes.forEach((node) => {
		analysis.nodes.set(node.id, { ...node, inDegree: 0, outDegree: 0 })
		adj.set(node.id, [])
	})

	typedGraph.edges.forEach((edge) => {
		const source = analysis.nodes.get(edge.source)
		const target = analysis.nodes.get(edge.target)
		if (source)
			source.outDegree++
		if (target)
			target.inDegree++
		if (adj.has(edge.source))
			adj.get(edge.source)!.push(edge.target)
	})

	analysis.startNodeIds = allNodeIds.filter(id => analysis.nodes.get(id)!.inDegree === 0)

	const visited = new Set<string>()
	const recursionStack = new Set<string>()
	function detectCycleUtil(nodeId: string, path: string[]) {
		visited.add(nodeId)
		recursionStack.add(nodeId)
		path.push(nodeId)

		const neighbors = adj.get(nodeId) || []
		for (const neighbor of neighbors) {
			if (recursionStack.has(neighbor)) {
				const cycleStartIndex = path.indexOf(neighbor)
				const cycle = path.slice(cycleStartIndex)
				analysis.cycles.push([...cycle, neighbor])
			}
			else if (!visited.has(neighbor)) {
				detectCycleUtil(neighbor, path)
			}
		}

		recursionStack.delete(nodeId)
		path.pop()
	}

	for (const nodeId of allNodeIds) {
		if (!visited.has(nodeId))
			detectCycleUtil(nodeId, [])
	}

	return analysis
}

/**
 * Factory for creating a generic, reusable validator that checks node properties.
 * A single rule can now return multiple errors for a single node.
 *
 * @param filter A predicate to select which nodes this rule applies to.
 * @param check A function that validates a selected node. It can return a single
 *   ValidationError, an array of them, or null if the node is valid.
 * @returns A Validator function.
 */
// (Type-Safe Overload) Creates a validator with strong types based on a NodeTypeMap.
export function createNodeRule<T extends NodeTypeMap>(
	filter: (node: TypedGraphNode<T>) => boolean,
	check: (
		node: TypedGraphNode<T> & { inDegree: number, outDegree: number },
	) => ValidationError | ValidationError[] | null | undefined,
): Validator<T>
// (Untyped Overload) Creates a validator with basic types.
export function createNodeRule(
	filter: (node: GraphNode) => boolean,
	check: (
		node: GraphNode & { inDegree: number, outDegree: number },
	) => ValidationError | ValidationError[] | null | undefined,
): Validator
// (Implementation) Factory for creating a generic, reusable validator.
export function createNodeRule(
	filter: (node: any) => boolean,
	check: (
		node: any,
	) => ValidationError | ValidationError[] | null | undefined,
): Validator {
	return (analysis: GraphAnalysis, _graph: WorkflowGraph): ValidationError[] => {
		const errors: ValidationError[] = []
		for (const node of analysis.nodes.values()) {
			if (filter(node)) {
				const result = check(node)
				if (result) {
					if (Array.isArray(result))
						errors.push(...result)
					else
						errors.push(result)
				}
			}
		}
		return errors
	}
}

/**
 * A built-in validator that reports any cycles found in the graph.
 */
export const checkForCycles: Validator = (analysis) => {
	const uniqueCycles = new Set(analysis.cycles.map(c => c.slice(0, -1).sort().join(',')))
	return Array.from(uniqueCycles).map((cycleKey) => {
		const representativeCycle = analysis.cycles.find(c => c.slice(0, -1).sort().join(',') === cycleKey)!
		return {
			nodeId: representativeCycle[0],
			type: 'CycleDetected',
			message: `Cycle detected involving nodes: ${representativeCycle.join(' -> ')}`,
		}
	})
}
