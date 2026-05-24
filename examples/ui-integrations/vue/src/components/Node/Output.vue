<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { Handle } from '@vue-flow/core'
import { computed } from 'vue'
import FlowNode, { type FlowcraftNodeProps } from './Node.vue'
import { useHandlePositions } from '../../composables/handlePositions'

const props = defineProps<NodeProps & FlowcraftNodeProps>()

const edges = computed(
	() => props.flow?.getEdges.value.map((e) => ({ source: e.source, target: e.target })) ?? [],
)
const { targetPosition } = useHandlePositions(props.id, props.flow, edges)
</script>

<template>
	<FlowNode v-bind="$props">
		<Handle type="target" :position="targetPosition" />
	</FlowNode>
</template>
