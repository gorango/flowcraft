<script setup>
import { hitlFlow } from '../../composables/simple-examples'

const example = hitlFlow
const positionsMap = {
	'start-approval': { x: 0, y: 100 },
	'wait-for-approval': { x: 300, y: 100 },
	'process-decision': { x: 600, y: 100 },
}
const typesMap = {
	'start-approval': 'input',
	'wait-for-approval': 'default',
	'process-decision': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="example" :positions-map :types-map />
	</div>
</template>
