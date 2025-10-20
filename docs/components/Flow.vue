<script setup lang="ts">
import type { Edge, Node } from '@vue-flow/core'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'

defineProps<{
	nodes: Node[]
	edges: Edge[]
}>()
</script>

<template>
	<div class="vue-flow-diagram">
		<VueFlow
			:nodes="nodes"
			:edges="edges"
			:fit-view-on-init="true"
			:nodes-draggable="false"
			:nodes-connectable="false"
			:pan-on-drag="true"
			:zoom-on-scroll="true"
			:zoom-on-double-click="true"
			class="vue-flow-wrapper"
		>
			<Background />
		</VueFlow>
	</div>
</template>

<style scoped>
.vue-flow-diagram {
  height: 400px;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-bg-soft);
  background-color: var(--vp-c-bg-alt);
}

.vue-flow-wrapper {
  height: 100%;
  width: 100%;
}

/* Add some default styles for the nodes and edges to match the theme */
:deep(.vue-flow__node-default) {
	background-color: var(--vp-c-bg);
	border-color: var(--vp-c-brand-1);
	color: var(--vp-c-text-1);
}

:deep(.vue-flow__edge-path) {
	stroke: var(--vp-c-brand-1);
}

:deep(.vue-flow__edge-text) {
	fill: var(--vp-c-text-2);
	font-size: 12px;
}
</style>
