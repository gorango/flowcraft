import { blueprints, config } from '@flowcraft/example-declarative-shared-logic'
import { Queue } from 'bullmq'
import type { WorkflowResult } from 'flowcraft'
import { analyzeBlueprint } from 'flowcraft'
import IORedis from 'ioredis'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-queue'
const ACTIVE_USE_CASE = '4.content-moderation'

export async function waitForWorkflow(
	redis: IORedis,
	runId: string,
	timeoutMs: number,
): Promise<{ status: string; payload?: WorkflowResult; reason?: string }> {
	const statusKey = `workflow:status:${runId}`
	const startTime = Date.now()

	console.log(`Awaiting result for Run ID ${runId} on key: ${statusKey}`)

	while (Date.now() - startTime < timeoutMs) {
		const statusJson = await redis.get(statusKey)
		if (statusJson) {
			await redis.del(statusKey) // Clean up
			return JSON.parse(statusJson)
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}

	return {
		status: 'failed',
		reason: `Timeout: Client did not receive a result within ${timeoutMs}ms.`,
	}
}

async function main() {
	console.log('--- Distributed Workflow Client ---')

	const runId = Math.floor(Math.random() * 10).toString()
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const queue = new Queue(QUEUE_NAME, { connection: redisConnection })

	const useCase = config[ACTIVE_USE_CASE]
	const blueprint = blueprints[useCase.entryWorkflowId]

	const analysis = analyzeBlueprint(blueprint)
	const startNodeIds = analysis.startNodeIds

	const initialContextData = {
		...useCase.initialContext,
		blueprintId: useCase.entryWorkflowId,
		blueprintVersion: blueprint.metadata?.version || null,
	}

	const stateKey = `workflow:state:${runId}`
	for (const [key, value] of Object.entries(initialContextData)) {
		await redisConnection.hset(stateKey, key, JSON.stringify(value))
	}

	const startJobs = startNodeIds.map((nodeId: any) => ({
		name: 'executeNode',
		data: { runId, blueprintId: useCase.entryWorkflowId, nodeId },
	}))

	console.log(`🚀 Enqueuing ${startJobs.length} start job(s) for Run ID: ${runId}`)
	await queue.addBulk(startJobs)

	try {
		const finalStatus = await waitForWorkflow(redisConnection, runId, 60000)
		console.log('\n=============================================================')

		switch (finalStatus.status) {
			case 'completed':
				console.log(`✅ Workflow Run ID: ${runId} COMPLETED.`)
				console.log('Final Output:', finalStatus.payload?.context?.final_output)
				break
			case 'cancelled':
				console.warn(`🛑 Workflow Run ID: ${runId} was successfully CANCELLED.`)
				console.log(`   Reason: ${finalStatus.reason}`)
				break
			case 'failed':
				console.error(`❌ Workflow Run ID: ${runId} FAILED or timed out.`)
				console.error(`   Reason: ${finalStatus.reason}`)
				break
		}
		console.log('=============================================================\n')
	} catch (error) {
		console.error(`Error waiting for workflow to complete for Run ID ${runId}`, error)
	}

	await redisConnection.quit()
	await queue.close()
}

main().catch(console.error)
