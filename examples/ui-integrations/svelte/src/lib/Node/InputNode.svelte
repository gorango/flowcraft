<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte'
	import FlowNode from './FlowNode.svelte'
	import type { NodeData } from './FlowNode.svelte'

	interface FlowNodeData extends Record<string, unknown> {
		label: string
		nodeData: NodeData
		sourcePosition?: Position
		targetPosition?: Position
	}

	let { data }: NodeProps = $props()
	let d = $derived(data as unknown as FlowNodeData)
</script>

<div class="wrapper">
	<FlowNode label={d.label} nodeData={d.nodeData} />
	<Handle type="source" position={d.sourcePosition ?? Position.Right} />
</div>

<style>
	.wrapper {
		width: fit-content;
	}
</style>
