<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<NodeProps>()
</script>

<template>
	<FlowNode>
		<Handle type="target" :position="Position.Left" />
		<span>
			{{ data.label }}
		</span>
	</FlowNode>
</template>
