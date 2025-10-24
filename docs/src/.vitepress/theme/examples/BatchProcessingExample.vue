<script setup>
import { createFlow } from 'flowcraft'
import Flow from '../components/Flow/Flow.vue'

const batchFlow = createFlow('batch-example')
	.node('start', async () => {
		await new Promise(r => setTimeout(r, 1000))
		return { output: [10, 20, 30] }
	})
	.batch(
		'double-items',
		async ({ input }) => {
			await new Promise(r => setTimeout(r, 1000))
			return { output: input * 2 }
		},
		{ inputKey: 'start', outputKey: 'doubled' },
	)
	.node(
		'sum-results',
		async ({ input }) => {
			await new Promise(r => setTimeout(r, 1000))
			return { output: input.reduce((acc, val) => acc + val, 0) }
		},
		{ inputs: 'doubled' },
	)
	.edge('start', 'double-items_scatter')
	.edge('double-items_gather', 'sum-results')

const positionsMap = {
	'start': { x: 0, y: 0 },
	'double-items_scatter': { x: 150 + 100, y: 0 },
	'double-items_gather': { x: 150 * 2 + 100 * 2, y: 0 },
	'sum-results': { x: 150 * 3 + 100 * 3, y: 0 },
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
