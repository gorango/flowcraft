<script setup>
import Flow from '../components/Flow/Flow.vue'
import { basicFlow } from '../composables/simple-examples'

const example = basicFlow
const positionsMap = {
	'step-a': { x: 0, y: 100 },
	'step-b': { x: 300, y: 100 },
	'step-c': { x: 600, y: 100 },
}
const typesMap = {
	'step-a': 'input',
	'step-b': 'default',
	'step-c': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="example" :positions-map :types-map />
	</div>
</template>
