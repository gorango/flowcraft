<script setup>
import { createFlow } from 'flowcraft'

const hitlFlow = createFlow('hitl-workflow')
	.node('start-approval', async () => ({ output: { user: 'Alice', amount: 1500 } }))
	.wait('wait-for-approval')
	.node('process-decision', async ({ input }) => {
		if (input?.approved)
			return { output: 'Request was approved.' }
		return { output: 'Request was denied.' }
	})
	.edge('start-approval', 'wait-for-approval')
	.edge('wait-for-approval', 'process-decision')

const positionsMap = {
	'start-approval': { x: 0, y: 100 },
	'wait-for-approval': { x: 300, y: 100 },
	'process-decision': { x: 600, y: 100 },
}
const typesMap = {
	'start-approval': 'input',
	'wait-for-approval': 'default',
	'process-decision': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow="hitlFlow" :positions-map :types-map />
	</div>
</template>
