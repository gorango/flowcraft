<script setup lang="ts">
import { NodeProps } from '@vue-flow/core'
import { computed } from 'vue'
import Status from './Status.vue'
import { NodeDataStatus } from '../Flow.vue'

export interface FlowcraftNodeProps {
	direction?: 'TB' | 'LR'
	nodeData: {
		inputs?: Record<string, any> | string
		outputs?: Record<string, any> | string
		status?: NodeDataStatus
	}
	batchProgress?: any[]
}

const props = defineProps<NodeProps & FlowcraftNodeProps>()

// const flow = inject('flow') as VueFlowStore

const hasInputs = computed(() => props.nodeData.inputs)
const hasOutputs = computed(() => props.nodeData.outputs)
const hasBatchProgress = computed(() => props.batchProgress && props.batchProgress.length > 0)
</script>

<template>
	<div class="w-48 flex flex-col gap-2 p-2 rounded-lg bg-muted/80 backdrop-blur-sm">
		<slot />
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Status :status="nodeData.status" />
				<span class="font-semibold text-sm">{{ data.label }}</span>
			</div>

			<div v-if="hasInputs" class="text-xs">
				<div class="font-medium text-gray-500 mb-1">
					Inputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre class="max-h-80 overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(nodeData.inputs) }}</pre>
				</div>
			</div>

			<div v-if="hasOutputs" class="text-xs">
				<div class="font-medium text-gray-500 mb-1">
					Outputs:
				</div>
				<div class="bg-muted p-2 rounded text-xs">
					<pre class="max-h-80 overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(nodeData.outputs) }}</pre>
				</div>
			</div>

			<div v-if="hasBatchProgress" class="text-xs">
				<div class="font-medium text-gray-500 mb-1">
					Progress:
				</div>
				<div class="bg-muted p-2 rounded text-xs space-y-2">
					<div v-for="(item, index) in batchProgress" :key="index">
						<pre class="max-h-80 overflow-auto nowheel nodrag cursor-text select-text">{{ JSON.stringify(item) }}</pre>
					</div>
				</div>
			</div>

			<div v-if="!hasInputs && !hasOutputs && !hasBatchProgress" class="text-xs text-gray-500">
				Waiting for data...
			</div>
		</div>
	</div>
</template>
