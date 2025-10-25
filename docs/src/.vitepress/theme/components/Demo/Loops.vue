<script setup>
import { createFlow } from 'flowcraft'

const loopFlow = createFlow('loop-example')
	.node('initialize', async ({ context }) => {
		await context.set('count', 0)
		await new Promise(r => setTimeout(r, 1000))
		return { output: 'Initialized' }
	})
	.node('increment', async ({ context }) => {
		const currentCount = await context.get('count') || 0
		const newCount = currentCount + 1
		await context.set('count', newCount)
		await new Promise(r => setTimeout(r, 1000))
		return { output: newCount }
	})
	.loop('counter', {
		startNodeId: 'increment',
		endNodeId: 'increment',
		condition: 'count < 5',
	})
	.node('finalize', async ({ context }) => {
		await context.set('count', 0)
		return { output: 'Finalized' }
	})
	.edge('initialize', 'increment')
	.edge('counter-loop', 'finalize')

const positionsMap = {
	'initialize': { x: 0, y: 120 },
	'increment': { x: 300, y: 0 },
	'counter-loop': { x: 300, y: 180 },
	'finalize': { x: 600, y: 120 },
}
const typesMap = {
	'initialize': 'input',
	'increment': 'default',
	'counter-loop': 'default',
	'finalize': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="loopFlow" :positions-map :types-map />
	</div>
</template>
