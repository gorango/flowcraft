<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { Status } from '~/components/ui/status'
import FlowNode from './Node.vue'

type StatusType = 'pending' | 'completed' | 'failed' | 'idle'

const props = withDefaults(defineProps<NodeProps & {
	direction?: 'TB' | 'LR'
	nodeData: {
		inputs?: Record<string, any> | string
		outputs?: Record<string, any> | string
		status?: StatusType
	}
	batchProgress?: any[]
}>(), {
	direction: 'LR',
})

const hasInputs = computed(() => props.nodeData.inputs && Object.keys(props.nodeData.inputs).length > 0)
const hasOutputs = computed(() => props.nodeData.outputs && Object.keys(props.nodeData.outputs).length > 0)
const hasBatchProgress = computed(() => props.batchProgress && props.batchProgress.length > 0)

const targetPosition = computed(() => props.direction === 'TB' ? Position.Top : Position.Left)
const sourcePosition = computed(() => props.direction === 'TB' ? Position.Bottom : Position.Right)
</script>

<template>
	<FlowNode>
		<Handle type="target" :position="targetPosition" />
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Status :status="nodeData.status" />
				<span class="font-semibold text-sm">{{ data.label }}</span>
			</div>

			<div v-if="hasInputs" class="text-sm">
				<div class="font-medium text-muted-foreground mb-1">
					Inputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre class="overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(nodeData.inputs, null, 2) }}</pre>
				</div>
			</div>

			<div v-if="hasOutputs" class="text-sm">
				<div class="font-medium text-muted-foreground mb-1">
					Outputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre class="overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(nodeData.outputs, null, 2) }}</pre>
				</div>
			</div>

			<div v-if="hasBatchProgress" class="text-sm">
				<div class="font-medium text-muted-foreground mb-1">
					Progress:
				</div>
				<div class="bg-muted p-2 rounded text-xs space-y-2">
					<!-- Loop through each completed worker item -->
					<div v-for="(item, index) in batchProgress" :key="index">
						<pre class="overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(item, null, 2) }}</pre>
					</div>
				</div>
			</div>

			<div v-if="!hasInputs && !hasOutputs && !hasBatchProgress" class="text-sm text-muted-foreground">
				Waiting to start...
			</div>
		</div>
		<Handle type="source" :position="sourcePosition" />
	</FlowNode>
</template>
