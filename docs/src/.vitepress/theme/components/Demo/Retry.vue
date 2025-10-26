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

let failCount = 0
async function flakyApi() {
	failCount++
	if (failCount <= 2)
		return mockApiCall('Flaky', 500, true)
	return mockApiCall('Flaky', 500, false)
}

const flow = createFlow('retries-workflow')
	.node('start-retries', async () => ({ output: 'start' }))
	.node('flaky-node', flakyApi, { config: { maxRetries: 3 } })
	.node('final-step', async () => {
		failCount = 0
		return { output: 'Workflow finished' }
	})
	.edge('start-retries', 'flaky-node')
	.edge('flaky-node', 'final-step')

const positionsMap = {
	'start-retries': { x: -220, y: 100 },
	'flaky-node': { x: 0, y: 100 },
	'final-step': { x: 220, y: 100 },
}
const typesMap = {
	'start-retries': 'input',
	'flaky-node': 'default',
	'final-step': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow :positions-map :types-map />
	</div>
</template>
