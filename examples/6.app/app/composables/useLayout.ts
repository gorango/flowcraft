import type { Edge, GraphEdge, GraphNode, Node } from '@vue-flow/core'
import dagre from '@dagrejs/dagre'
import { Position, useVueFlow } from '@vue-flow/core'
import { ref } from 'vue'

export function useLayout() {
	const { findNode } = useVueFlow()

	const graph = ref(new dagre.graphlib.Graph())

	const previousDirection = ref<'TB' | 'LR'>('LR')

	function layout(nodes: Array<GraphNode | Node>, edges: Array<GraphEdge | Edge>, direction: 'TB' | 'LR'): GraphNode[] {
		const dagreGraph = new dagre.graphlib.Graph()
		graph.value = dagreGraph
		const isHorizontal = direction === 'LR'
		dagreGraph.setGraph({ rankdir: direction })
		dagreGraph.setDefaultEdgeLabel(() => ({}))
		previousDirection.value = direction
		for (const node of nodes) {
			const graphNode = findNode(node.id)
			dagreGraph.setNode(node.id, {
				width: graphNode?.dimensions.width || 256,
				height: graphNode?.dimensions.height || 256,
			})
		}
		for (const edge of edges) {
			dagreGraph.setEdge(edge.source, edge.target)
		}
		try {
			dagre.layout(toValue(dagreGraph))
			return nodes.map((node) => {
				const nodeWithPosition = dagreGraph.node(node.id)
				return {
					...node,
					targetPosition: isHorizontal ? Position.Left : Position.Top,
					sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
					position: { x: nodeWithPosition.x, y: nodeWithPosition.y },
				} as GraphNode
			})
		}
		catch (error) {
			console.error('Error while layouting graph:', error)
			return nodes as GraphNode[]
		}
	}

	return { graph, layout, previousDirection }
}
