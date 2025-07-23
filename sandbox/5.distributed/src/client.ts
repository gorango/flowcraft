import path from 'node:path'
import process from 'node:process'
import { ConsoleLogger, TypedContext } from 'cascade'
import IORedis from 'ioredis'
import { BullMQExecutor } from './executor'
import { WorkflowRegistry } from './registry'
import { RUN_ID } from './types'

const config = {
	'1.blog-post': {
		mainWorkflowId: 100,
		getInitialContext: () => new TypedContext([
			['topic', 'The rise of AI-powered workflow automation in modern software development.'],
		]),
	},
	'2.job-application': {
		mainWorkflowId: 200,
		getInitialContext: () => new TypedContext([
			['applicantName', 'Jane Doe'],
			['resume', 'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.'],
			['coverLetter', 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position. My skills and experience align perfectly with the requirements of the role.'],
		]),
	},
	'3.customer-review': {
		mainWorkflowId: 300,
		getInitialContext: () => new TypedContext([
			['initial_review', 'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.'],
		]),
	},
	'4.content-moderation': {
		mainWorkflowId: 400,
		getInitialContext: () => new TypedContext([
			['userId', 'user-456'],
			// Try different posts to test different paths
			// Path 1: PII detection
			['userPost', 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.'],
			// Path 2: Spam
			// ['userPost', '!!!BUY NOW!!! Visit my-scam-site.com for a FREE PRIZE! Limited time offer!'],
			// Path 3: Severe hate speech
			// ['userPost', `I don't want any dirty immigrants in my country, stealing, raping, and killing my people. They should all be eradicated!`],
			// Path 4: Moderate hate speech (approve)
			// ['userPost', `I don't want any illegal immigrants in my country.`],
			// Path 5: Approved post
			// ['userPost', 'I really enjoy using this platform. The new features are great and very helpful.'],
		]),
	},
} as const

type UseCase = keyof typeof config

// --- CONFIGURATION ---
const QUEUE_NAME = 'distributed-cascade-queue'
const ACTIVE_USE_CASE: UseCase = '2.job-application'
const WORKFLOW_ID = config[ACTIVE_USE_CASE].mainWorkflowId

async function main() {
	const logger = new ConsoleLogger()
	logger.info('--- Distributed Workflow Client ---')

	const runId = Math.random().toString(36).substring(2, 4)
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const useCaseDirectory = path.join(process.cwd(), 'data', ACTIVE_USE_CASE)
	const registry = await WorkflowRegistry.create(useCaseDirectory)

	const flow = await registry.getFlow(WORKFLOW_ID)
	const context = config[ACTIVE_USE_CASE].getInitialContext()
	context.set(RUN_ID, runId) // Add runId to the context

	const executor = new BullMQExecutor(QUEUE_NAME, redisConnection, registry)

	console.log()
	logger.info(`Use-case: "${ACTIVE_USE_CASE}"`)
	console.log('\n=============================================================')
	logger.info(`🚀 Starting Workflow Run ID: ${runId}`)
	console.log('=============================================================\n')

	await flow.run(context, {
		logger,
		executor,
		params: { runId, workflowId: WORKFLOW_ID },
	})

	logger.info('Client finished. The workflow is now running on the worker(s).')
	logger.info('Switch to the worker terminal to see progress or cancel.')
	await redisConnection.quit()
}

main().catch(console.error)
