<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { Textarea } from '~/components/ui/textarea'

const props = defineProps<NodeProps>()

const { flow } = useWorkflow()

const textValue = computed({
	get() {
		return props.data?.value || ''
	},
	set(newValue) {
		flow.updateNodeData(props.id, { value: newValue })
	},
})
</script>

<template>
	<FlowNode>
		<Handle type="target" :position="Position.Left" />
		<span>
			{{ data.label }}
		</span>
		<Textarea
			v-model="textValue"
			placeholder="Enter text here..."
			class="resize-none"
		/>
		<Handle type="source" :position="Position.Right" />
	</FlowNode>
</template>
