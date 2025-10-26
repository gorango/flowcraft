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

const flow = createFlow('basic-workflow')
	.node('step-a', () => mockApiCall('Step A', 1000))
	.node('step-b', async () => {
		return mockApiCall('Step B', 1500)
	})
	.node('step-c', async () => {
		return mockApiCall('Step C', 500)
	})
	.edge('step-a', 'step-b')
	.edge('step-b', 'step-c')

const positionsMap = {
	'step-a': { x: 0, y: 100 },
	'step-b': { x: 250, y: 100 },
	'step-c': { x: 500, y: 100 },
}
const typesMap = {
	'step-a': 'input',
	'step-b': 'default',
	'step-c': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Suspense>
			<Stepper :flow :positions-map :types-map />
		</Suspense>
	</div>
</template>
