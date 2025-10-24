<script setup>
import Flow from '../components/Flow/Flow.vue'
import { parallelFlow } from '../composables/simple-examples'

const example = parallelFlow
const positionsMap = {
	'start-parallel': { x: 0, y: 200 },
	'task-1': { x: 300, y: 0 },
	'task-2': { x: 300, y: 200 },
	'task-3': { x: 300, y: 400 },
	'gather': { x: 600, y: 200 },
}
const typesMap = {
	'start-parallel': 'input',
	'task-1': 'default',
	'task-2': 'default',
	'task-3': 'default',
	'gather': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="example" :positions-map :types-map />
	</div>
</template>

<style scoped>
.flowcraft-flow {
	height: 500px;
}
</style>
