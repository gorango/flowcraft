<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { Status } from '~/components/ui/status'
import FlowNode from './Node.vue'

type StatusType = 'pending' | 'completed' | 'failed' | 'idle'

const props = defineProps<NodeProps & {
	nodeData?: Record<string, any>
	inputs?: Record<string, any> | string
	outputs?: Record<string, any> | string
	status?: StatusType
	progress?: number
}>()

const hasInputs = computed(() => props.inputs && Object.keys(props.inputs).length > 0)
const hasOutputs = computed(() => props.outputs && Object.keys(props.outputs).length > 0)
</script>

<template>
	<FlowNode>
		<Handle type="target" :position="Position.Left" />
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Status :status="status" :progress="progress" />
				<span class="font-semibold text-sm">{{ data.label }}</span>
			</div>

			<div v-if="hasInputs" class="text-sm">
				<div class="font-medium text-muted-foreground mb-1">
					Inputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre>{{ JSON.stringify(inputs, null, 2) }}</pre>
				</div>
			</div>

			<div v-if="hasOutputs" class="text-sm">
				<div class="font-medium text-muted-foreground mb-1">
					Outputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre>{{ JSON.stringify(outputs, null, 2) }}</pre>
				</div>
			</div>

			<div v-if="!hasInputs && !hasOutputs" class="text-sm text-muted-foreground">
				No data available
			</div>
		</div>
		<Handle type="source" :position="Position.Right" />
	</FlowNode>
</template>
