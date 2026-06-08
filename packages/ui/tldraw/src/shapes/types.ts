import type { FlowBuilder, NodeDefinition, NodeRegistry, WorkflowBlueprint } from 'flowcraft'
import type { TLShape } from 'tldraw'

export const FLOWCRAFT_NODE = 'flowcraft-node'

export type NodeStatus = 'idle' | 'pending' | 'completed' | 'failed'

export type PortDirection = 'input' | 'output'

export interface PortDefinition {
	id: string
	type: PortDirection
	label: string
}

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		[FLOWCRAFT_NODE]: {
			w: number
			h: number
			nodeDef: NodeDefinition
			status: NodeStatus
			nodeData?: Record<string, any>
		}
	}
}

export type FlowcraftNodeShape = TLShape<typeof FLOWCRAFT_NODE>

export interface ArrowEdgeMeta {
	action?: string
	condition?: string
	transform?: string
	isLoopback?: boolean
}

export interface FlowcraftCanvasProps {
	flow: FlowBuilder<any, any>
	positions: Record<string, { x: number; y: number }>
	init?: Record<string, any>
	className?: string
}

export interface FlowcraftEditorProps {
	blueprint?: WorkflowBlueprint
	onBlueprintChange?: (blueprint: WorkflowBlueprint) => void
	registry?: NodeRegistry
	className?: string
}
