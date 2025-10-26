<script setup>
import { createFlow } from 'flowcraft'

const vizFlow = createFlow('visualization-example')
	.node('fetch', async () => ({ output: { value: 10 } }))
	.node('check', async ({ input }) => ({
		action: input.value > 5 ? 'big' : 'small',
	}), { threshold: 5 })
	.node('process-big', async () => ({}))
	.node('process-small', async () => ({}))
	.edge('fetch', 'check')
	.edge('check', 'process-big', { action: 'big' })
	.edge('check', 'process-small', { action: 'small' })

const positionsMap = {
	'fetch': { x: 100, y: 100 },
	'check': { x: 300, y: 100 },
	'process-big': { x: 500, y: 50 },
	'process-small': { x: 500, y: 150 },
}
const typesMap = {
	'fetch': 'input',
	'check': 'default',
	'process-big': 'output',
	'process-small': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="vizFlow" :positions-map :types-map />
	</div>
</template>
