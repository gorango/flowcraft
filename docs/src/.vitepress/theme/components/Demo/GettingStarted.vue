<script setup>
import { createFlow } from 'flowcraft'

const simpleFlow = createFlow('simple-workflow')
	.node('start', async ({ context }) => {
		const value = 42
		await context.set('initial_value', value)
		await new Promise(r => setTimeout(r, 1000))
		return { output: value }
	})
	.node('double', async ({ context, input }) => {
		const doubled = input * 2
		await context.set('doubled_value', doubled)
		await new Promise(r => setTimeout(r, 1000))
		return { output: doubled }
	})
	.edge('start', 'double')

const positionsMap = {
	start: { x: 0, y: 0 },
	double: { x: 240 + 48, y: 0 },
}
const typesMap = {
	start: 'input',
	double: 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="simpleFlow" :positions-map :types-map />
	</div>
</template>
