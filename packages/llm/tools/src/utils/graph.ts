import type { WorkflowBlueprint } from 'flowcraft'

interface EdgeData {
	source: string
	target: string
	action?: string
	condition?: string
	transform?: string
}

function getEdgeData(e: unknown): EdgeData {
	const edge = e as Record<string, unknown>
	return {
		source: edge.source as string,
		target: edge.target as string,
		action: edge.action as string | undefined,
		condition: edge.condition as string | undefined,
		transform: edge.transform as string | undefined,
	}
}

function getNodeId(n: unknown): string {
	return (n as Record<string, unknown>).id as string
}

export function getPredecessors(
	blueprint: WorkflowBlueprint,
	nodeId: string,
): Array<{ nodeId: string; edge: EdgeData }> {
	const predecessors: Array<{ nodeId: string; edge: EdgeData }> = []
	for (const edge of blueprint.edges) {
		const edgeData = getEdgeData(edge)
		if (edgeData.target === nodeId) {
			predecessors.push({ nodeId: edgeData.source, edge: edgeData })
		}
	}
	return predecessors
}

export function getSuccessors(
	blueprint: WorkflowBlueprint,
	nodeId: string,
): Array<{ nodeId: string; edge: EdgeData }> {
	const successors: Array<{ nodeId: string; edge: EdgeData }> = []
	for (const edge of blueprint.edges) {
		const edgeData = getEdgeData(edge)
		if (edgeData.source === nodeId) {
			successors.push({ nodeId: edgeData.target, edge: edgeData })
		}
	}
	return successors
}

export function haveAllPredecessorsCompleted(
	blueprint: WorkflowBlueprint,
	nodeId: string,
	completedNodes: Set<string>,
): boolean {
	const predecessors = getPredecessors(blueprint, nodeId)
	if (predecessors.length === 0) return true
	return predecessors.every((p) => completedNodes.has(p.nodeId))
}

export function getExecutionOrder(blueprint: WorkflowBlueprint): string[] {
	const adjacency = new Map<string, string[]>()
	const inDegree = new Map<string, number>()

	for (const node of blueprint.nodes) {
		const id = getNodeId(node)
		adjacency.set(id, [])
		inDegree.set(id, 0)
	}

	for (const edge of blueprint.edges) {
		const edgeData = getEdgeData(edge)
		adjacency.get(edgeData.source)?.push(edgeData.target)
		inDegree.set(edgeData.target, (inDegree.get(edgeData.target) ?? 0) + 1)
	}

	const queue: string[] = []
	for (const [nodeId, degree] of inDegree) {
		if (degree === 0) queue.push(nodeId)
	}

	const order: string[] = []
	while (queue.length > 0) {
		const nodeId = queue.shift()!
		order.push(nodeId)
		for (const neighbor of adjacency.get(nodeId) ?? []) {
			const newDegree = (inDegree.get(neighbor) ?? 1) - 1
			inDegree.set(neighbor, newDegree)
			if (newDegree === 0) queue.push(neighbor)
		}
	}

	return order
}

export function findOrphanNodes(blueprint: WorkflowBlueprint): string[] {
	const reachable = new Set<string>()
	const adjacency = new Map<string, string[]>()

	for (const node of blueprint.nodes) {
		adjacency.set(getNodeId(node), [])
	}
	for (const edge of blueprint.edges) {
		const edgeData = getEdgeData(edge)
		adjacency.get(edgeData.source)?.push(edgeData.target)
	}

	const startNodes = blueprint.nodes.filter(
		(n) => !blueprint.edges.some((e) => getEdgeData(e).target === getNodeId(n)),
	)

	const stack = startNodes.map((n) => getNodeId(n))
	while (stack.length > 0) {
		const nodeId = stack.pop()!
		if (reachable.has(nodeId)) continue
		reachable.add(nodeId)
		for (const neighbor of adjacency.get(nodeId) ?? []) {
			stack.push(neighbor)
		}
	}

	return blueprint.nodes.map((n) => getNodeId(n)).filter((id) => !reachable.has(id))
}

export function getDataFlow(
	blueprint: WorkflowBlueprint,
	fromNodeId: string,
	toNodeId: string,
): { inputMapping: Record<string, string>; transform?: string } | null {
	const edge = blueprint.edges.find((e) => {
		const edgeData = getEdgeData(e)
		return edgeData.source === fromNodeId && edgeData.target === toNodeId
	})

	if (!edge) return null

	const edgeData = getEdgeData(edge)

	const targetNode = blueprint.nodes.find((n) => getNodeId(n) === toNodeId)
	const targetInputs = targetNode?.inputs

	let inputMapping: Record<string, string> = {}
	if (targetInputs && typeof targetInputs === 'object' && !Array.isArray(targetInputs)) {
		inputMapping = targetInputs as Record<string, string>
	} else if (typeof targetInputs === 'string') {
		inputMapping = { default: targetInputs }
	}

	return {
		inputMapping,
		transform: edgeData.transform,
	}
}
