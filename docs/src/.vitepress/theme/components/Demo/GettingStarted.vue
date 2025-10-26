<script setup lang="ts">
import type { NodeContext } from 'flowcraft'
import { createFlow } from 'flowcraft'

const init = { value: 42 }

async function startNode({ context }: NodeContext) {
	await new Promise(r => setTimeout(r, 500))
	return { output: await context.get('value') }
}

async function doubleNode({ input }: NodeContext) {
	await new Promise(r => setTimeout(r, 500))
	return { output: input * 2 }
}

const flow = createFlow('simple-workflow')
	.node('start', startNode)
	.node('double', doubleNode)
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
		<Flow :flow :init :positions-map :types-map />
	</div>
</template>
