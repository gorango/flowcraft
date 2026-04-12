import { StatusIndicator, type NodeDataStatus } from './StatusIndicator'

export interface NodeData {
	inputs?: any
	outputs?: any
	contextChanges?: Record<string, any>
	status?: NodeDataStatus
}

export function FlowNode({ label, nodeData }: { label: string; nodeData: NodeData }) {
	const hasInputs = nodeData.inputs !== undefined && nodeData.inputs !== null
	const hasOutputs = nodeData.outputs !== undefined && nodeData.outputs !== null

	return (
		<div className="w-48 flex flex-col gap-2 p-2 rounded-lg bg-card border border-border shadow-sm">
			<div className="flex items-center gap-2">
				<StatusIndicator status={nodeData.status || 'idle'} />
				<span className="font-semibold text-sm text-foreground truncate">{label}</span>
			</div>

			{hasInputs && (
				<div className="text-xs">
					<div className="font-medium text-muted-foreground mb-1">Inputs</div>
					<div className="bg-muted rounded p-1.5">
						<pre className="max-h-20 overflow-auto nowheel nodrag cursor-text select-text whitespace-pre-wrap break-all text-[10px] leading-relaxed">
							{JSON.stringify(nodeData.inputs, null, 1)}
						</pre>
					</div>
				</div>
			)}

			{hasOutputs && (
				<div className="text-xs">
					<div className="font-medium text-muted-foreground mb-1">Outputs</div>
					<div className="bg-muted rounded p-1.5">
						<pre className="max-h-20 overflow-auto nowheel nodrag cursor-text select-text whitespace-pre-wrap break-all text-[10px] leading-relaxed">
							{JSON.stringify(nodeData.outputs, null, 1)}
						</pre>
					</div>
				</div>
			)}

			{!hasInputs && !hasOutputs && (
				<div className="text-[11px] text-muted-foreground italic">Waiting for data…</div>
			)}
		</div>
	)
}
