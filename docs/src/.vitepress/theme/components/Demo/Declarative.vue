<script setup lang="ts">
import type { NodeRegistry, WorkflowBlueprint } from 'flowcraft'

const blueprint: WorkflowBlueprint = {
	id: 'coffee-shop-order',
	nodes: [
		{
			id: 'take-order',
			uses: 'takeOrderFn',
		},
		{
			id: 'make-drink',
			uses: 'makeDrinkFn',
			inputs: 'take-order',
		},
		{
			id: 'serve-customer',
			uses: 'serveCustomerFn',
			inputs: 'make-drink',
		},
	],
	edges: [
		{
			source: 'take-order',
			target: 'make-drink',
		},
		{
			source: 'make-drink',
			target: 'serve-customer',
		},
	],
}

const registry: NodeRegistry = {
	takeOrderFn: async () => {
		await new Promise(r => setTimeout(r, 1000))
		return { output: { item: 'Coffee', size: 'Medium' } }
	},
	makeDrinkFn: async ({ input }) => {
		await new Promise(r => setTimeout(r, 1000))
		return { output: `Made ${input.size} ${input.item}` }
	},
	serveCustomerFn: async ({ input }) => {
		await new Promise(r => setTimeout(r, 1000))
		return { output: `Served: ${input}` }
	},
}

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
		<Flow :blueprint :registry :positions-map :types-map />
	</div>
</template>
