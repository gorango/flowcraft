'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FlowNode, type NodeData } from './FlowNode'

interface FlowNodeData extends Record<string, unknown> {
	label: string
	nodeData: NodeData
	sourcePosition?: Position
	targetPosition?: Position
}

export function InputNode({ data }: NodeProps) {
	const d = data as FlowNodeData
	return (
		<div className="w-fit">
			<FlowNode label={d.label} nodeData={d.nodeData} />
			<Handle type="source" position={d.sourcePosition ?? Position.Right} />
		</div>
	)
}

export function DefaultNode({ data }: NodeProps) {
	const d = data as FlowNodeData
	return (
		<div className="w-fit">
			<Handle type="target" position={d.targetPosition ?? Position.Left} />
			<FlowNode label={d.label} nodeData={d.nodeData} />
			<Handle type="source" position={d.sourcePosition ?? Position.Right} />
		</div>
	)
}

export function OutputNode({ data }: NodeProps) {
	const d = data as FlowNodeData
	return (
		<div className="w-fit">
			<Handle type="target" position={d.targetPosition ?? Position.Left} />
			<FlowNode label={d.label} nodeData={d.nodeData} />
		</div>
	)
}
