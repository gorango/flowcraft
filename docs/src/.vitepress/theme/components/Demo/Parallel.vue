<script setup>
import { createFlow } from 'flowcraft'

async function mockApiCall(name, delay, shouldFail = false) {
	await new Promise(resolve => setTimeout(resolve, delay))
	if (shouldFail) {
		throw new Error(`API call "${name}" failed.`)
	}
	const result = { data: `Data from ${name}` }
	return { output: result }
}

const parallelFlow = createFlow('parallel-workflow')
	.node('start-parallel', async () => ({ output: 'start' }))
	.node('task-1', () => mockApiCall('Task 1', 2000))
	.node('task-2', () => mockApiCall('Task 2', 1000))
	.node('task-3', () => mockApiCall('Task 3', 1500))
	.node('gather', async (ctx) => {
		const t1 = await ctx.context.get('_outputs.task-1')
		const t2 = await ctx.context.get('_outputs.task-2')
		const t3 = await ctx.context.get('_outputs.task-3')
		return { output: { t1, t2, t3 } }
	})
	.edge('start-parallel', 'task-1')
	.edge('start-parallel', 'task-2')
	.edge('start-parallel', 'task-3')
	.edge('task-1', 'gather')
	.edge('task-2', 'gather')
	.edge('task-3', 'gather')

const positionsMap = {
	'start-parallel': { x: 0, y: 200 },
	'task-1': { x: 300, y: 0 },
	'task-2': { x: 300, y: 200 },
	'task-3': { x: 300, y: 400 },
	'gather': { x: 600, y: 200 },
}
const typesMap = {
	'start-parallel': 'input',
	'task-1': 'default',
	'task-2': 'default',
	'task-3': 'default',
	'gather': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="parallelFlow" :positions-map :types-map />
	</div>
</template>

<style scoped>
.flowcraft-flow {
	height: 500px;
}
</style>
