<script setup>
import { createFlow } from 'flowcraft'

const coffeeFlow = createFlow('coffee-shop')
	.node('take-order', () => ({ output: { item: 'Coffee', size: 'Medium' } }))
	.node('make-drink', async ({ input }) => ({ output: `Made ${input.size} ${input.item}` }))
	.node('serve-customer', async ({ input }) => ({ output: `Served: ${input}` }))
	.edge('take-order', 'make-drink')
	.edge('make-drink', 'serve-customer')

const positionsMap = {
	'take-order': { x: 0, y: 100 },
	'make-drink': { x: 300, y: 100 },
	'serve-customer': { x: 600, y: 100 },
}
const typesMap = {
	'take-order': 'input',
	'make-drink': 'default',
	'serve-customer': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="coffeeFlow" :positions-map :types-map />
	</div>
</template>
