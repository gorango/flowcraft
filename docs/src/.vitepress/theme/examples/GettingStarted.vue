<script setup lang="ts">
import { createFlow } from 'flowcraft'

interface SimpleWorkflowContext {
	initial_value?: number
	doubled_value?: number
}

const simpleFlow = createFlow<SimpleWorkflowContext>('simple-workflow')
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
	'start': { x: 0, y: 0 },
	'double': { x: 240 + 48, y: 0 },
}

const typesMap = {
	'start': 'input',
	'double': 'output',
}
</script>

<template>
	<div class="getting-started-example">
		<Flow :flow="simpleFlow" :positions-map :types-map />
	</div>
</template>

<style scoped>
.getting-started-example {
	height: 333px;
	width: 100%;
}
</style>
