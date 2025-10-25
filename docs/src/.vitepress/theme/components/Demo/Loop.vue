<script setup>
import { createFlow } from 'flowcraft'

const loopFlow = createFlow('loop-example')
	.node('initialize', async ({ context }) => {
		await context.set('count', 0)
		return { output: 'Initialized' }
	})
	.node('increment', async ({ context }) => {
		const currentCount = await context.get('count') || 0
		const newCount = currentCount + 1
		await context.set('count', newCount)
		return { output: newCount }
	})
	.loop('counter', {
		startNodeId: 'increment',
		endNodeId: 'increment',
		condition: 'count < 5',
	})
	.edge('initialize', 'increment')

const positionsMap = {
	'initialize': { x: 100, y: 100 },
	'increment': { x: 300, y: 100 },
	'counter-loop': { x: 500, y: 100 },
}
const typesMap = {
	'initialize': 'input',
	'increment': 'default',
	'counter-loop': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="loopFlow" :positions-map :types-map />
	</div>
</template>
