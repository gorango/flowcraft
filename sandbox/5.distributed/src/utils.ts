import type { WorkflowResult } from 'flowcraft/v2'
import type IORedis from 'ioredis'
import OpenAI from 'openai'
import 'dotenv/config'

const openaiClient = new OpenAI()

export async function callLLM(prompt: string): Promise<string> {
	try {
		console.log(`\n--- Sending to LLM ---\n${prompt.substring(0, 300)}...\n---------------------\n`)
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.2,
		})
		const result = response.choices[0].message.content || ''
		console.log(`--- Received from LLM ---\n${result}\n-----------------------\n`)
		return result
	}
	catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		throw new Error(`OpenAI API call failed: ${error.message}`)
	}
}

export function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		return value !== undefined && value !== null ? String(value) : ''
	})
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
