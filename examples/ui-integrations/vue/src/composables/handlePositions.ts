import { Position, useVueFlow } from '@vue-flow/core'
import { computed, type Ref } from 'vue'

const OPPOSITE: Record<string, Position> = {
	[Position.Top]: Position.Bottom,
	[Position.Bottom]: Position.Top,
	[Position.Left]: Position.Right,
	[Position.Right]: Position.Left,
}

export function useHandlePositions(
	nodeId: string,
	flow: ReturnType<typeof useVueFlow> | undefined,
	edges: Ref<{ source: string; target: string }[]>,
) {
	const sourcePosition = computed(() => {
		if (!flow) return Position.Right
		const connectedEdges = edges.value.filter((e) => e.source === nodeId)
		if (connectedEdges.length === 0) return Position.Right

		let dx = 0
		let dy = 0

		for (const edge of connectedEdges) {
			const targetNode = flow.findNode(edge.target)
			const sourceNode = flow.findNode(nodeId)
			if (!targetNode || !sourceNode) continue

			dx += targetNode.position.x - sourceNode.position.x
			dy += targetNode.position.y - sourceNode.position.y
		}

		if (Math.abs(dx) > Math.abs(dy)) {
			return dx >= 0 ? Position.Right : Position.Left
		}
		return dy >= 0 ? Position.Bottom : Position.Top
	})

	const targetPosition = computed(() => {
		if (!flow) return Position.Left
		const connectedEdges = edges.value.filter((e) => e.target === nodeId)
		if (connectedEdges.length === 0) return Position.Left

		const hasLoopback = connectedEdges.some((e) => e.source === e.target)
		if (hasLoopback) {
			return OPPOSITE[sourcePosition.value] ?? Position.Left
		}

		let dx = 0
		let dy = 0

		for (const edge of connectedEdges) {
			const sourceNode = flow.findNode(edge.source)
			const targetNode = flow.findNode(nodeId)
			if (!sourceNode || !targetNode) continue

			dx += sourceNode.position.x - targetNode.position.x
			dy += sourceNode.position.y - targetNode.position.y
		}

		if (Math.abs(dx) > Math.abs(dy)) {
			return dx >= 0 ? Position.Right : Position.Left
		}
		return dy >= 0 ? Position.Bottom : Position.Top
	})

	return { sourcePosition, targetPosition }
}
