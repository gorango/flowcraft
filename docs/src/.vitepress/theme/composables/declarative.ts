import type { WorkflowBlueprint } from 'flowcraft'

// Cloned from 4.declarative-shared-logic/src/utils.ts
async function callLLM(prompt: string): Promise<string> {
	try {
		const { response } = await $fetch('/api/llm', {
			method: 'POST',
			body: { prompt },
		})
		return response
	} catch (error: any) {
		console.error('Error calling LLM:', error)
		return `Error: Could not get a response from the LLM. Details: ${error.message}`
	}
}

function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		if (value === undefined || value === null) {
			console.warn(`Template variable '{{${key.trim()}}}' not found in data.`)
			return `{{${key.trim()}}}`
		}
		return String(value)
	})
}

// Cloned from 4.declarative-shared-logic/src/nodes.ts
interface LlmNodeContext {
	params: {
		promptTemplate: string
		inputs: Record<string, string | string[]>
		outputKey?: string
	}
	context: any
}

async function resolveInputs(
	context: any,
	inputs: Record<string, string | string[]>,
): Promise<Record<string, any>> {
	const resolved: Record<string, any> = {}
	for (const [templateKey, sourceKeyOrKeys] of Object.entries(inputs)) {
		const sourceKeys = Array.isArray(sourceKeyOrKeys) ? sourceKeyOrKeys : [sourceKeyOrKeys]
		let valueFound = false
		for (const sourceKey of sourceKeys) {
			// Try direct context key first
			if (await context.has(sourceKey)) {
				const value = await context.get(sourceKey)
				if (value !== undefined) {
					resolved[templateKey] = value
					valueFound = true
					break
				}
			}
			// Try node output format (_outputs.nodeId)
			if (await context.has(`_outputs.${sourceKey}`)) {
				let value = await context.get(`_outputs.${sourceKey}`)
				if (value !== undefined) {
					// If the value is an object and has 'final_output', extract it
					if (typeof value === 'object' && value !== null && 'final_output' in value) {
						value = value.final_output
					}
					resolved[templateKey] = value
					valueFound = true
					break
				}
			}
		}
		if (!valueFound) {
			resolved[templateKey] = ''
		}
	}
	return resolved
}

export async function llmProcess(ctx: any): Promise<any> {
	const llmCtx = ctx as LlmNodeContext
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const prompt = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	const result = await callLLM(prompt)
	return { output: result }
}

export async function llmCondition(ctx: any): Promise<any> {
	const result = await llmProcess(ctx)
	const action = result.output?.toLowerCase().includes('true') ? 'true' : 'false'
	return { action, output: result.output }
}

export async function llmRouter(ctx: any): Promise<any> {
	const result = await llmProcess(ctx)
	const action = result.output?.trim() ?? 'default'
	return { action, output: result.output }
}

export async function outputNode(ctx: any): Promise<any> {
	const llmCtx = ctx as LlmNodeContext
	const { outputKey = 'final_output' } = llmCtx.params
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const finalOutput = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	await ctx.context.set(outputKey, finalOutput)
	return { output: finalOutput }
}

// Cloned from 4.declarative-shared-logic/src/registry.ts
export const agentNodeRegistry = {
	'llm-process': llmProcess,
	'llm-condition': llmCondition,
	'llm-router': llmRouter,
	output: outputNode,
}

// Cloned from 4.declarative-shared-logic/src/config.ts
export const config = {
	'1.blog-post': {
		entryWorkflowId: '100',
		initialContext: {
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		},
	},
	'2.job-application': {
		entryWorkflowId: '200',
		initialContext: {
			applicantName: 'Jane Doe',
			resume:
				'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position.',
		},
	},
	'3.customer-review': {
		entryWorkflowId: '300',
		initialContext: {
			initial_review:
				'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.',
		},
	},
	'4.content-moderation': {
		entryWorkflowId: '400',
		initialContext: {
			userId: 'user-456',
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		},
	},
} as const

// Hardcoded blueprints (cloned from JSON files)
// Function to convert blueprint to graph representation (cloned from flowcraft)
export function toGraphRepresentation(blueprint: WorkflowBlueprint) {
	const processedBlueprint = processBlueprint(blueprint)
	const nodes = processedBlueprint.nodes.map(node => ({
		id: node.id,
		data: { label: node.id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
	}))
	const edges = processedBlueprint.edges.map((edge, index) => ({
		id: `edge-${index}`,
		source: edge.source,
		target: edge.target,
		...(edge.action ? { label: edge.action } : {}),
	}))
	return { nodes, edges }
}

// Function to process blueprints and set joinStrategy for convergence nodes
export function processBlueprint(blueprint: WorkflowBlueprint): WorkflowBlueprint {
	const nodePredecessorMap = new Map<string, string[]>()

	// Wire up the edges to the nodes
	blueprint.edges.forEach((edge: any) => {
		if (!nodePredecessorMap.has(edge.target)) nodePredecessorMap.set(edge.target, [])
		nodePredecessorMap.get(edge.target)?.push(edge.source)
	})

	// Check if all predecessors are the same (i.e., it's a fan-out from a single router)
	const processedNodes = blueprint.nodes.map(node => {
		const predecessors = nodePredecessorMap.get(node.id)
		if (predecessors && predecessors.length > 1) {
			const firstPredecessor = predecessors[0]
			if (predecessors.every((p) => p === firstPredecessor)) {
				console.log(`[Blueprint Loader] Automatically setting joinStrategy='any' for convergence node '${node.id}'`)
				return { ...node, config: { ...node.config, joinStrategy: 'any' as 'any' } }
			} else {
				// For conditional branches, set joinStrategy to 'any'
				console.log(`[Blueprint Loader] Automatically setting joinStrategy='any' for conditional convergence node '${node.id}'`)
				return { ...node, config: { ...node.config, joinStrategy: 'any' as 'any' } }
			}
		}
		return node
	})

	return { ...blueprint, nodes: processedNodes }
}

export const blueprints: Record<string, WorkflowBlueprint> = {
	'100': {
		id: '100',
		nodes: [
			{
				id: 'generate_outline',
				uses: 'llm-process',
				params: {
					promptTemplate: "Generate a detailed, multi-point blog post outline for the topic: \"{{topic}}\".",
					inputs: { topic: 'topic' },
				},
			},
			{
				id: 'draft_post',
				uses: 'llm-process',
				params: {
					promptTemplate: "Write a full-length, engaging blog post based on the following outline:\n\n{{outline}}",
					inputs: { outline: 'generate_outline' },
				},
			},
			{
				id: 'suggest_titles',
				uses: 'llm-process',
				params: {
					promptTemplate: "Suggest 5 catchy, SEO-friendly titles for the following blog post. Respond with a simple numbered list.\n\nPost:\n{{draft}}",
					inputs: { draft: 'draft_post' },
				},
			},
			{
				id: 'final_output',
				uses: 'output',
				params: {
					promptTemplate: "--- TITLES ---\n{{titles}}\n\n--- DRAFT ---\n{{draft}}",
					inputs: { titles: 'suggest_titles', draft: 'draft_post' },
				},
			},
		],
		edges: [
			{ source: 'generate_outline', target: 'draft_post' },
			{ source: 'draft_post', target: 'suggest_titles' },
			{ source: 'suggest_titles', target: 'final_output' },
		],
	},
	'200': {
		id: '200',
		nodes: [
			{
				id: 'extract_skills',
				uses: 'llm-process',
				params: {
					promptTemplate: "Extract a list of all technical skills from this resume. Format as a simple comma-separated string:\n\n{{resume}}",
					inputs: { resume: 'resume' },
				},
			},
			{
				id: 'analyze_tone',
				uses: 'llm-process',
				params: {
					promptTemplate: "Analyze the tone of this cover letter. Respond with a single word: \"professional\", \"casual\", or \"unprofessional\".\n\n{{coverLetter}}",
					inputs: { coverLetter: 'coverLetter' },
				},
			},
			{
				id: 'check_qualifications',
				uses: 'llm-condition',
				params: {
					promptTemplate: "Does this list of skills `{{skills}}` contain all of the following required skills: `TypeScript, Node.js, SQL`? Also, is the cover letter tone `{{tone}}` professional? Respond only 'true' if both conditions are met, otherwise 'false'.",
					inputs: { skills: 'extract_skills', tone: 'analyze_tone' },
				},
			},
			{
				id: 'send_interview_email',
				uses: 'subflow',
				params: {
					blueprintId: '201',
					outputs: { send_interview_email: 'final_output' },
					inputs: { applicantName: 'applicantName' },
				},
			},
			{
				id: 'send_rejection_email',
				uses: 'subflow',
				params: {
					blueprintId: '202',
					outputs: { send_rejection_email: 'final_output' },
					inputs: { applicantName: 'applicantName' },
				},
			},
			{
				id: 'final_output',
				uses: 'output',
				params: {
					promptTemplate: "Final email sent to {{applicantName}}:\n\n{{email_body}}",
					inputs: { applicantName: 'applicantName', email_body: ['send_interview_email', 'send_rejection_email'] },
				},
			},
		],
		edges: [
			{ source: 'extract_skills', target: 'check_qualifications' },
			{ source: 'analyze_tone', target: 'check_qualifications' },
			{ source: 'check_qualifications', target: 'send_interview_email', action: 'true' },
			{ source: 'check_qualifications', target: 'send_rejection_email', action: 'false' },
			{ source: 'send_interview_email', target: 'final_output' },
			{ source: 'send_rejection_email', target: 'final_output' },
		],
	},
	'201': {
		id: '201',
		nodes: [
			{
				id: 'gen_interview_email',
				uses: 'llm-process',
				params: {
					promptTemplate: "Write a polite and professional email inviting {{applicantName}} to an interview. Mention you were impressed with their resume.",
					inputs: { applicantName: 'applicantName' },
				},
			},
			{
				id: 'output_email',
				uses: 'output',
				params: {
					promptTemplate: "{{result}}",
					inputs: { result: 'gen_interview_email' },
				},
			},
		],
		edges: [
			{ source: 'gen_interview_email', target: 'output_email' },
		],
	},
	'202': {
		id: '202',
		nodes: [
			{
				id: 'gen_rejection_email',
				uses: 'llm-process',
				params: {
					promptTemplate: "Write a polite and professional email to {{applicantName}} informing them that you will not be moving forward with their application at this time. Thank them for their interest.",
					inputs: { applicantName: 'applicantName' },
				},
			},
			{
				id: 'output_email',
				uses: 'output',
				params: {
					promptTemplate: "{{result}}",
					inputs: { result: 'gen_rejection_email' },
				},
			},
		],
		edges: [
			{ source: 'gen_rejection_email', target: 'output_email' },
		],
	},
	'300': {
		id: '300',
		nodes: [
			{
				id: 'summarize',
				uses: 'llm-process',
				params: {
					promptTemplate: "Summarize this review in one sentence: {{review}}",
					inputs: { review: 'initial_review' },
				},
			},
			{
				id: 'categorize',
				uses: 'llm-process',
				params: {
					promptTemplate: "Categorize this review into ONLY ONE of: 'Bug Report', 'Feature Request', 'General Feedback'. Review: {{review}}",
					inputs: { review: 'initial_review' },
				},
			},
			{
				id: 'check_sentiment',
				uses: 'llm-condition',
				params: {
					promptTemplate: "Is the sentiment of this summary positive? '{{summary}}'. Respond only 'true' or 'false'.",
					inputs: { summary: 'summarize' },
				},
			},
			{
				id: 'positive_branch',
				uses: 'subflow',
				params: {
					blueprintId: '301',
					inputs: { summary: 'summarize' },
					outputs: { final_positive_reply: 'final_output' },
				},
			},
			{
				id: 'negative_branch',
				uses: 'subflow',
				params: {
					blueprintId: '302',
					inputs: { summary: 'summarize', category: 'categorize' },
					outputs: { generated_ticket: 'ticket_payload', generated_reply: 'customer_message' },
				},
			},
			{
				id: 'send_to_ticketing_system',
				uses: 'llm-process',
				params: {
					promptTemplate: "--- SIMULATING API CALL ---\nPOST /api/tickets\nPayload: {{ticket_data}}",
					inputs: { ticket_data: 'generated_ticket' },
				},
			},
			{
				id: 'send_email_to_customer',
				uses: 'llm-process',
				params: {
					promptTemplate: "--- SIMULATING EMAIL SENT ---\nTo: customer@example.com\nBody: {{email_body}}",
					inputs: { email_body: 'generated_reply' },
				},
			},
			{
				id: 'final_step',
				uses: 'output',
				params: {
					outputKey: 'final_output',
					promptTemplate: "--- Final Actions Taken ---\nTicket System: {{ticket_action}}\n\nCustomer Email: {{email_action}}\n\nPositive Flow Result: {{positive_result}}",
					inputs: { ticket_action: ['send_to_ticketing_system'], email_action: ['send_email_to_customer'], positive_result: ['final_positive_reply'] },
				},
			},
		],
		edges: [
			{ source: 'summarize', target: 'check_sentiment' },
			{ source: 'categorize', target: 'check_sentiment' },
			{ source: 'check_sentiment', target: 'positive_branch', action: 'true' },
			{ source: 'check_sentiment', target: 'negative_branch', action: 'false' },
			{ source: 'negative_branch', target: 'send_to_ticketing_system' },
			{ source: 'negative_branch', target: 'send_email_to_customer' },
			{ source: 'positive_branch', target: 'final_step' },
			{ source: 'send_to_ticketing_system', target: 'final_step' },
			{ source: 'send_email_to_customer', target: 'final_step' },
		],
	},
	'301': {
		id: '301',
		nodes: [
			{
				id: 'gen_thanks',
				uses: 'llm-process',
				params: {
					promptTemplate: "Write a friendly \"thank you\" email to a customer for their positive feedback. Mention that you appreciate them highlighting: \"{{summary}}\".",
					inputs: { summary: 'summary' },
				},
			},
			{
				id: 'output_thanks',
				uses: 'output',
				params: {
					outputKey: 'final_output',
					promptTemplate: "{{result}}",
					inputs: { result: 'gen_thanks' },
				},
			},
		],
		edges: [
			{ source: 'gen_thanks', target: 'output_thanks' },
		],
	},
	'302': {
		id: '302',
		nodes: [
			{
				id: 'gen_ticket_data',
				uses: 'llm-process',
				params: {
					promptTemplate: "Generate a Jira-style ticket in JSON format. The JSON should have two keys: 'title' and 'description'. Title: 'Customer Feedback: {{category}}'. Description: 'User reported an issue summarized as: {{summary}}'.",
					inputs: { category: 'category', summary: 'summary' },
				},
			},
			{
				id: 'gen_customer_reply',
				uses: 'llm-process',
				params: {
					promptTemplate: "Write a polite, reassuring email to a customer. Inform them that you have received their feedback regarding '{{summary}}' and have created a ticket for the team to review. Do not include a subject line.",
					inputs: { summary: 'summary' },
				},
			},
			{
				id: 'output_ticket',
				uses: 'output',
				params: {
					outputKey: 'ticket_payload',
					promptTemplate: "{{result}}",
					inputs: { result: 'gen_ticket_data' },
				},
			},
			{
				id: 'output_reply',
				uses: 'output',
				params: {
					outputKey: 'customer_message',
					promptTemplate: "{{result}}",
					inputs: { result: 'gen_customer_reply' },
				},
			},
		],
		edges: [
			{ source: 'gen_ticket_data', target: 'output_ticket' },
			{ source: 'gen_customer_reply', target: 'output_reply' },
		],
	},
	'400': {
		id: '400',
		nodes: [
			{
				id: 'check_for_pii',
				uses: 'llm-condition',
				params: {
					promptTemplate: "Does the following text contain any Personally Identifiable Information (PII) like an email address, phone number, or physical address? Respond only with 'true' or 'false'.\n\nText: \"{{userPost}}\"",
					inputs: { userPost: 'userPost' },
				},
			},
			{
				id: 'check_for_hate_speech',
				uses: 'llm-process',
				params: {
					promptTemplate: "Analyze the following text for hate speech. Respond with only ONE of the following severity levels: 'none', 'moderate', or 'severe'.\n\nText: \"{{userPost}}\"",
					inputs: { userPost: 'userPost' },
				},
			},
			{
				id: 'check_for_spam',
				uses: 'llm-condition',
				params: {
					promptTemplate: "Does the following text appear to be commercial spam, containing suspicious links or promotional language? Respond only with 'true' or 'false'.\n\nText: \"{{userPost}}\"",
					inputs: { userPost: 'userPost' },
				},
			},
			{
				id: 'triage_post',
				uses: 'llm-router',
				params: {
					promptTemplate: "Given the following analysis of a user post, decide on the single most appropriate action. Respond with ONLY ONE of the following action codes: 'action_ban', 'action_redact', 'action_delete_spam', 'action_approve'.\n\n- Hate Speech Level: {{hate_speech_level}}\n- PII Found: {{pii_found}}\n- Spam Detected: {{spam_detected}}\n\nRules:\n1. If Hate Speech is 'severe', the action is 'action_ban'.\n2. If PII is 'true' (and hate speech is not 'severe'), the action is 'action_redact'.\n3. If Spam is 'true' (and the above are false), the action is 'action_delete_spam'.\n4. Otherwise, the action is 'action_approve'.",
					inputs: { hate_speech_level: 'check_for_hate_speech', pii_found: 'check_for_pii', spam_detected: 'check_for_spam' },
				},
			},
			{
				id: 'ban_user_branch',
				uses: 'subflow',
				params: {
					blueprintId: '401',
					inputs: { userId: 'userId', reason: 'check_for_hate_speech' },
					outputs: { moderation_result: 'ban_summary' },
				},
			},
			{
				id: 'redact_post_branch',
				uses: 'subflow',
				params: {
					blueprintId: '402',
					inputs: { userPost: 'userPost', userId: 'userId' },
					outputs: { moderation_result: 'redaction_summary' },
				},
			},
			{
				id: 'delete_spam_branch',
				uses: 'subflow',
				params: {
					blueprintId: '403',
					inputs: { userId: 'userId' },
					outputs: { moderation_result: 'spam_deletion_summary' },
				},
			},
			{
				id: 'approve_post_branch',
				uses: 'llm-process',
				params: {
					promptTemplate: "The user post from {{userId}} was analyzed and approved with no issues. Create a simple log message confirming this.",
					inputs: { userId: 'userId' },
				},
			},
			{
				id: 'final_log',
				uses: 'output',
				config: { joinStrategy: 'any' },
				params: {
					outputKey: 'final_output',
					promptTemplate: "--- CONTENT MODERATION COMPLETE ---\n\nFinal Action Log:\n{{final_action_taken}}",
					inputs: { final_action_taken: ['moderation_result', 'approve_post_branch'] },
				},
			},
		],
		edges: [
			{ source: 'check_for_pii', target: 'triage_post' },
			{ source: 'check_for_hate_speech', target: 'triage_post' },
			{ source: 'check_for_spam', target: 'triage_post' },
			{ source: 'triage_post', target: 'ban_user_branch', action: 'action_ban' },
			{ source: 'triage_post', target: 'redact_post_branch', action: 'action_redact' },
			{ source: 'triage_post', target: 'delete_spam_branch', action: 'action_delete_spam' },
			{ source: 'triage_post', target: 'approve_post_branch', action: 'action_approve' },
			{ source: 'ban_user_branch', target: 'final_log' },
			{ source: 'redact_post_branch', target: 'final_log' },
			{ source: 'delete_spam_branch', target: 'final_log' },
			{ source: 'approve_post_branch', target: 'final_log' },
		],
	},
	'401': {
		id: '401',
		nodes: [
			{
				id: 'api_call_ban_user',
				uses: 'llm-process',
				params: {
					promptTemplate: "Simulate a database update to ban a user. Respond with a simulated SQL command.\n\nUPDATE users SET status='banned' WHERE id={{userId}};",
					inputs: { userId: 'userId' },
				},
			},
			{
				id: 'log_ban_event',
				uses: 'llm-process',
				params: {
					promptTemplate: "Simulate writing to a security log. Respond with a simulated log entry.\n\nEVENT: UserBanned\nUSER_ID: {{userId}}\nREASON: {{reason}}\nSEVERITY: critical",
					inputs: { userId: 'userId', reason: 'reason' },
				},
			},
			{
				id: 'output_ban_summary',
				uses: 'output',
				params: {
					outputKey: 'ban_summary',
					promptTemplate: "User Banned Successfully.\n--- DB Action ---\n{{db_update}}\n\n--- Log Entry ---\n{{log_entry}}",
					inputs: { db_update: 'api_call_ban_user', log_entry: 'log_ban_event' },
				},
			},
		],
		edges: [
			{ source: 'api_call_ban_user', target: 'output_ban_summary' },
			{ source: 'log_ban_event', target: 'output_ban_summary' },
		],
	},
	'402': {
		id: '402',
		nodes: [
			{
				id: 'redact_pii',
				uses: 'llm-process',
				params: {
					promptTemplate: "Remove all PII from this post and replace with placeholders. Original: {{userPost}}",
					inputs: { userPost: 'userPost' },
				},
			},
			{
				id: 'log_redaction',
				uses: 'llm-process',
				params: {
					promptTemplate: "Simulate logging the redaction event.\n\nEVENT: PostRedacted\nUSER_ID: {{userId}}\nACTION: PII Removed",
					inputs: { userId: 'userId' },
				},
			},
			{
				id: 'output_redaction_summary',
				uses: 'output',
				params: {
					outputKey: 'redaction_summary',
					promptTemplate: "Post Redacted Successfully.\n--- Redacted Post ---\n{{redacted_post}}\n\n--- Log ---\n{{log}}",
					inputs: { redacted_post: 'redact_pii', log: 'log_redaction' },
				},
			},
		],
		edges: [
			{ source: 'redact_pii', target: 'output_redaction_summary' },
			{ source: 'log_redaction', target: 'output_redaction_summary' },
		],
	},
	'403': {
		id: '403',
		nodes: [
			{
				id: 'delete_post',
				uses: 'llm-process',
				params: {
					promptTemplate: "Simulate deleting a spam post.\n\nDELETE FROM posts WHERE user_id={{userId}};",
					inputs: { userId: 'userId' },
				},
			},
			{
				id: 'log_deletion',
				uses: 'llm-process',
				params: {
					promptTemplate: "Simulate logging the deletion.\n\nEVENT: SpamDeleted\nUSER_ID: {{userId}}\nACTION: Post Removed",
					inputs: { userId: 'userId' },
				},
			},
			{
				id: 'output_spam_summary',
				uses: 'output',
				params: {
					outputKey: 'spam_deletion_summary',
					promptTemplate: "Spam Deleted Successfully.\n--- Deletion ---\n{{deletion}}\n\n--- Log ---\n{{log}}",
					inputs: { deletion: 'delete_post', log: 'log_deletion' },
				},
			},
		],
		edges: [
			{ source: 'delete_post', target: 'output_spam_summary' },
			{ source: 'log_deletion', target: 'output_spam_summary' },
		],
	},
}
