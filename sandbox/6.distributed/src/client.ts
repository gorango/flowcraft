import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Queue } from 'bullmq'
import { analyzeBlueprint } from 'flowcraft'
import IORedis from 'ioredis'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-queue'
const ACTIVE_USE_CASE = '4.content-moderation'

const config = {
	'1.blog-post': {
		mainWorkflowId: '100',
		initialContext: {
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		},
	},
	'2.job-application': {
		mainWorkflowId: '200',
		initialContext: {
			applicantName: 'Jane Doe',
			resume: 'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position.',
		},
	},
	'3.customer-review': {
		mainWorkflowId: '300',
		initialContext: {
			initial_review: 'The new dashboard is a huge improvement, but the export-to-PDF feature is really slow and sometimes crashes the app on large datasets.',
		},
	},
	'4.content-moderation': {
		mainWorkflowId: '400',
		initialContext: {
			userId: 'user-456',
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		},
	},
}

export async function waitForWorkflow(redis: IORedis, runId: string, timeoutMs: number): Promise<{ status: string, payload?: WorkflowResult, reason?: string }> {
	const statusKey = `workflow:status:${runId}`
	const startTime = Date.now()

	console.log(`Awaiting result for Run ID ${runId} on key: ${statusKey}`)

	while (Date.now() - startTime < timeoutMs) {
		const statusJson = await redis.get(statusKey)
		if (statusJson) {
			await redis.del(statusKey) // Clean up
			return JSON.parse(statusJson)
		}
		await new Promise(resolve => setTimeout(resolve, 500))
	}

	return { status: 'failed', reason: `Timeout: Client did not receive a result within ${timeoutMs}ms.` }
}

async function loadBlueprint(blueprintPath: string) {
	const blueprintContent = await fs.readFile(blueprintPath, 'utf-8')
	return JSON.parse(blueprintContent)
}

async function main() {
	console.log('--- Distributed Workflow Client ---')

	const runId = Math.floor(Math.random() * 10).toString()
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const queue = new Queue(QUEUE_NAME, { connection: redisConnection })

	const useCase = config[ACTIVE_USE_CASE]
	const blueprintPath = path.join(process.cwd(), '..', '5.dag', 'data', ACTIVE_USE_CASE, `${useCase.mainWorkflowId}.json`)
	const blueprint = await loadBlueprint(blueprintPath)

	const analysis = analyzeBlueprint(blueprint)
	const startNodeIds = analysis.startNodeIds

	const initialContextData = useCase.initialContext

	const stateKey = `workflow:state:${runId}`
	for (const [key, value] of Object.entries(initialContextData)) {
		await redisConnection.hset(stateKey, key, JSON.stringify(value))
	}

	const startJobs = startNodeIds.map((nodeId: any) => ({
		name: 'executeNode',
		data: { runId, blueprintId: useCase.mainWorkflowId, nodeId },
	}))

	console.log(`🚀 Enqueuing ${startJobs.length} start job(s) for Run ID: ${runId}`)
	await queue.addBulk(startJobs)

	try {
		const finalStatus = await waitForWorkflow(redisConnection, runId, 60000)
		console.log('\n=============================================================')

		switch (finalStatus.status) {
			case 'completed':
				console.log(`✅ Workflow Run ID: ${runId} COMPLETED.`)
				console.log('Final Output:', finalStatus.payload?.context?.moderation_result)
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
	}
	catch (error) {
		console.error(`Error waiting for workflow to complete for Run ID ${runId}`, error)
	}

	await redisConnection.quit()
	await queue.close()
}

main().catch(console.error)
