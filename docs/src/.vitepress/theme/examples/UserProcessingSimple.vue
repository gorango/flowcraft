<script setup lang="ts">
import { createFlow } from 'flowcraft'

interface UserProcessingContext {
	user_data?: { id: number; name: string }
	validation_result?: boolean
	processing_status?: 'pending' | 'completed' | 'failed'
}

const userProcessingFlow = createFlow<UserProcessingContext>('user-processing')
	.node('fetch-user', async ({ context }) => {
		const user = { id: 1, name: 'Alice' }
		await context.set('user_data', user)
		await new Promise(r => setTimeout(r, 1000))
		return { output: user }
	})
	.node('validate-user', async ({ context, input }) => {
		const userData = input as { id: number; name: string }
		const isValid = userData.name === 'Alice'
		await context.set('validation_result', isValid)
		await new Promise(r => setTimeout(r, 1000))
		return {
			output: isValid,
			action: isValid ? 'valid' : 'invalid'
		}
	}, { inputs: 'fetch-user' })
	.node('process-valid', async ({ context }) => {
		const userData = await context.get('user_data')
		const validation = await context.get('validation_result')
		await context.set('processing_status', 'completed')
		await new Promise(r => setTimeout(r, 1000))
		return { output: `Processed user ${userData?.name}` }
	})
	.node('handle-invalid', async ({ context }) => {
		await context.set('processing_status', 'failed')
		await new Promise(r => setTimeout(r, 1000))
		return { output: 'Invalid user data' }
	})
	.edge('fetch-user', 'validate-user')
	.edge('validate-user', 'process-valid', { action: 'valid' })
	.edge('validate-user', 'handle-invalid', { action: 'invalid' })

const positionsMap = {
	'fetch-user': { x: 0, y: 0 },
	'validate-user': { x: 225, y: 0 },
	'process-valid': { x: 500, y: -100 },
	'handle-invalid': { x: 500, y: 100 },
}

const typesMap = {
	'fetch-user': 'input',
	'validate-user': 'default',
	'process-valid': 'output',
	'handle-invalid': 'output',
}
</script>

<template>
	<div class="user-processing-example">
		<Flow :flow="userProcessingFlow" :positions-map :types-map />
	</div>
</template>

<style scoped>
.user-processing-example {
	height: 333px;
	width: 100%;
}
</style>
