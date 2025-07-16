export interface GraphNode {
	id: string
	type: string
	data: any
}

export interface GraphEdge {
	source: string
	target: string
	action?: string
}

export interface WorkflowGraph {
	nodes: GraphNode[]
	edges: GraphEdge[]
}
