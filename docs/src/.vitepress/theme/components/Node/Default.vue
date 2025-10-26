<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'
import FlowNode, { FlowcraftNodeProps } from './Node.vue'

const props = defineProps<NodeProps & FlowcraftNodeProps>()

const targetPosition = computed(() => props.direction === 'TB' ? Position.Top : Position.Left)
const sourcePosition = computed(() => props.direction === 'TB' ? Position.Bottom : Position.Right)
</script>

<template>
	<FlowNode v-bind="$props">
		<Handle type="target" :position="targetPosition" />
		<Handle type="source" :position="sourcePosition" />
	</FlowNode>
</template>
