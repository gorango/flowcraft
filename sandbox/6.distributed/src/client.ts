import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { waitForWorkflow } from './utils.js'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-queue'
const ACTIVE_USE_CASE = '4.content-moderation' // Change this to test other scenarios

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

async function main() {
	console.log('--- Distributed Workflow Client ---')

	// Generate a simple random run ID for this run
	const runId = Math.floor(Math.random() * 10).toString()
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const queue = new Queue(QUEUE_NAME, { connection: redisConnection })

	const useCase = config[ACTIVE_USE_CASE]
	const jobPayload = {
		runId,
		blueprintId: useCase.mainWorkflowId,
		initialContext: useCase.initialContext,
	}

	console.log(`🚀 Enqueuing workflow '${useCase.mainWorkflowId}' with Run ID: ${runId}`)
	await queue.add('runWorkflow', jobPayload)

	try {
		const finalStatus = await waitForWorkflow(redisConnection, runId, 60000) // Wait for up to 60s
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
