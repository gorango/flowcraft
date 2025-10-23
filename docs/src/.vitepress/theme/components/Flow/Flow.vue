<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { ConnectionMode, VueFlow } from '@vue-flow/core'

const { nodes, edges } = useWorkflow()
</script>

<template>
	<ClientOnly>
		<div class="h-96 border rounded-xl">
			<VueFlow
				id="workflow-flow"
				v-model:nodes="nodes"
				v-model:edges="edges"
				:multi-selection-key-code="['Meta', 'Control']"
				:delete-key-code="['Delete', 'Backspace']"
				:connection-mode="ConnectionMode.Strict"
				:snap-to-grid="true"
				:max-zoom="1.5"
				:min-zoom="0.1"
				fit-view
				class="flow"
			>
				<Background />
				<Controls />
				<template #node-output="nodeProps">
					<FlowNodeOutput v-bind="nodeProps" />
				</template>
				<template #node-process="nodeProps">
					<FlowNodeProcess v-bind="nodeProps" />
				</template>
				<template #node-input="nodeProps">
					<FlowNodeInput v-bind="nodeProps" />
				</template>
			</VueFlow>
		</div>
	</ClientOnly>
</template>

<style>
.flow {
  height: 100%;
}
</style>
