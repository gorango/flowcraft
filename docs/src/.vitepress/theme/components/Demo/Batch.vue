<script setup>
import { createFlow } from 'flowcraft'

const batchFlow = createFlow('batch-example')
	.node('start', () => ({ output: [10, 20, 30] }))
	.batch('double-items', async ({ input }) => ({ output: input * 2 }), {
		inputKey: 'start',
		outputKey: 'doubled',
	})
	.node('sum-results', async ({ input }) => ({ output: input.reduce((acc, val) => acc + val, 0) }), {
		inputs: 'doubled',
	})
	.edge('start', 'double-items_scatter')
	.edge('double-items_gather', 'sum-results')

const positionsMap = {
	'start': { x: 100, y: 100 },
	'double-items_scatter': { x: 300, y: 100 },
	'double-items_gather': { x: 500, y: 100 },
	'sum-results': { x: 700, y: 100 },
}
const typesMap = {
	'start': 'input',
	'double-items_scatter': 'default',
	'double-items_gather': 'default',
	'sum-results': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="batchFlow" :positions-map :types-map />
	</div>
</template>
