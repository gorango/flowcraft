<script setup>
import { createFlow } from 'flowcraft'

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
		{
			inputKey: 'start',
			outputKey: 'doubled',
		},
	)
	.node(
		'sum-results',
		async ({ input }) => {
			await new Promise(r => setTimeout(r, 1000))
			return { output: input.reduce((acc, val) => acc + val, 0) }
		},
		{ inputs: 'doubled' },
	)
	.edge('start', 'double-items')
	.edge('double-items', 'sum-results')

const positionsMap = {
	'start': { x: 100, y: 100 },
	'double-items': { x: 350, y: 100 },
	'sum-results': { x: 600, y: 100 },
}
const typesMap = {
	'start': 'input',
	'double-items': 'default',
	'sum-results': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="batchFlow" :positions-map :types-map />
	</div>
</template>
