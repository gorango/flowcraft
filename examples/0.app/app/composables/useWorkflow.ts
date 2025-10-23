import type { Edge, Node } from '@vue-flow/core'
import { useVueFlow } from '@vue-flow/core'

export type WorkflowNodeType = 'input' | 'process' | 'output' | string

export interface WorkflowNode extends Node {
	type: WorkflowNodeType
}

export function useWorkflow() {
	const flow = useVueFlow('workflow-flow')

	const isRunning = ref(false)
	const executionResult = ref<unknown>(null)
	const executionError = ref<string | null>(null)

	const savedNodes = useLocalStorage<WorkflowNode[]>('workflow-nodes', [])
	const savedEdges = useLocalStorage<Edge[]>('workflow-edges', [])

	flow.onNodesChange(() => {
		nextTick(() => {
			savedNodes.value = flow.toObject().nodes as WorkflowNode[]
		})
	})
	flow.onConnect((connection) => {
		nextTick(() => {
			flow.addEdges(connection)
		})
	})
	flow.onInit(() => {
		nextTick(() => {
			flow.fitView()
		})
	})

	const workflowElements = computed(() => ({
		nodes: flow.nodes.value,
		edges: flow.edges.value,
	}))

	const addWorkflowNode = (node: Partial<WorkflowNode>) => {
		const newNode: Partial<Node> = {
			...node,
			id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
		}
		flow.addNodes([newNode as WorkflowNode])
	}

	const addWorkflowEdge = (edge: Edge) => {
		const newEdge: Edge = {
			...edge,
			id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
		}
		flow.addEdges([newEdge])
	}

	const clearWorkflow = () => {
		flow.setNodes([])
		flow.setEdges([])
		executionResult.value = null
		executionError.value = null
	}

	const serializeWorkflow = () => {
		return {
			nodes: flow.nodes.value.map(node => ({
				id: node.id,
				type: node.type,
				position: node.position,
				data: node.data,
			})),
			edges: flow.edges.value.map(edge => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				type: edge.type,
			})),
		}
	}

	const runWorkflow = async () => {
		isRunning.value = true
		executionError.value = null
		try {
			const workflowData = serializeWorkflow()
			const response = await $fetch('/api/workflows', {
				method: 'POST',
				body: workflowData,
			})
			executionResult.value = response
		}
		catch (error) {
			executionError.value = error instanceof Error ? error.message : 'Unknown error'
			console.error('Error running workflow:', error)
		}
		finally {
			isRunning.value = false
		}
	}

	return {
		flow,

		// Vue Flow state
		nodes: savedNodes,
		edges: savedEdges,
		workflowElements,

		// Workflow management
		addWorkflowNode,
		addWorkflowEdge,
		clearWorkflow,
		serializeWorkflow,

		// Execution
		isRunning,
		executionResult,
		executionError,
		runWorkflow,
	}
}
