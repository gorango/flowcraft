import type Redis from 'ioredis'
import type { WorkflowStatus } from './types'
import OpenAI from 'openai'
import 'dotenv/config'

const openaiClient = new OpenAI()

/**
 * Calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
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

/**
 * Resolves a template string by replacing {{key}} with values from a data object.
 * This is crucial for dynamically constructing prompts.
 */
export function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		if (value === undefined || value === null) {
			console.warn(`Template variable '{{${key.trim()}}}' not found in data.`)
			return `{{${key.trim()}}}`
		}
		return String(value)
	})
}

/**
 * Polls Redis for the final status of a workflow run.
 * @param redis The IORedis client instance.
 * @param runId The unique ID of the workflow run to wait for.
 * @param timeoutMs The maximum time to wait in milliseconds.
 * @returns A promise that resolves with the final WorkflowStatus.
 */
export async function waitForWorkflow(redis: Redis, runId: string, timeoutMs: number): Promise<WorkflowStatus> {
	const statusKey = `workflow:status:${runId}`
	const startTime = Date.now()

	while (Date.now() - startTime < timeoutMs) {
		const statusJson = await redis.get(statusKey)
		if (statusJson) {
			await redis.del(statusKey) // Clean up the key
			return JSON.parse(statusJson) as WorkflowStatus
		}
		// Wait a bit before polling again
		await new Promise(resolve => setTimeout(resolve, 500))
	}

	// If the loop finishes, it's a timeout.
	return { status: 'failed', reason: `Timeout: Workflow did not complete within ${timeoutMs}ms.` }
}
