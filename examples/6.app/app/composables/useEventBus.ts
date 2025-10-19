import type { FlowcraftEvent, IEventBus } from 'flowcraft'

// In-memory event bus for collecting node data
class InMemoryEventBus implements IEventBus {
	private listeners: Map<string, ((event: FlowcraftEvent) => void)[]> = new Map()
	public nodeData: Map<string, { inputs?: any, outputs?: any, contextChanges?: Record<string, any> }> = new Map()

	emit(event: FlowcraftEvent): void {
		console.log('Event emitted:', event)

		// Handle node start - capture inputs
		if (event.type === 'node:start') {
			const { nodeId, input } = event.payload
			if (!this.nodeData.has(nodeId)) {
				this.nodeData.set(nodeId, {})
			}
			const nodeInfo = this.nodeData.get(nodeId)!
			nodeInfo.inputs = input
		}

		// Handle node finish - capture outputs
		if (event.type === 'node:finish') {
			const { nodeId, result } = event.payload
			if (!this.nodeData.has(nodeId)) {
				this.nodeData.set(nodeId, {})
			}
			const nodeInfo = this.nodeData.get(nodeId)!
			nodeInfo.outputs = result.output
		}

		// Handle context changes
		if (event.type === 'context:change') {
			const { sourceNode, key, value } = event.payload
			if (!this.nodeData.has(sourceNode)) {
				this.nodeData.set(sourceNode, { contextChanges: {} })
			}
			const nodeInfo = this.nodeData.get(sourceNode)!
			if (!nodeInfo.contextChanges) {
				nodeInfo.contextChanges = {}
			}
			nodeInfo.contextChanges[key] = value
		}

		// Notify listeners
		const eventListeners = this.listeners.get(event.type) || []
		eventListeners.forEach(listener => listener(event))
	}

	on(eventType: string, listener: (event: FlowcraftEvent) => void) {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, [])
		}
		this.listeners.get(eventType)!.push(listener)
	}

	off(eventType: string, listener: (event: FlowcraftEvent) => void) {
		const eventListeners = this.listeners.get(eventType)
		if (eventListeners) {
			const index = eventListeners.indexOf(listener)
			if (index > -1) {
				eventListeners.splice(index, 1)
			}
		}
	}

	getNodeData(nodeId: string) {
		return this.nodeData.get(nodeId) || {}
	}

	clear() {
		this.nodeData.clear()
	}
}

export function useEventBus() {
	const eventBus = new InMemoryEventBus()

	return {
		eventBus,
		getNodeData: (nodeId: string) => eventBus.getNodeData(nodeId),
		clearNodeData: () => eventBus.clear(),
	}
}
