// Data for the Goal Diagram
export const goal = {
	nodes: [
		{ id: 'main', label: 'Entry', position: { x: 50, y: 0 }, type: 'input' },
		{ id: 'group-def', data: { label: 'Workflow Definition' }, position: { x: -200, y: 200 }, style: { width: '250px', height: '140px', backgroundColor: 'rgba(52, 81, 178, 0.2)', 'z-index': -1 } },
		{ id: 'blueprint', label: 'JSON Blueprint', data: { label: 'JSON Blueprint' }, position: { x: 50, y: 50 }, parentNode: 'group-def' },
		{ id: 'group-exec', data: { label: 'Execution Logic' }, position: { x: 200, y: 200 }, style: { width: '250px', height: '400px', backgroundColor: 'rgba(52, 81, 178, 0.2)', 'z-index': -1 } },
		{ id: 'runtime', label: 'FlowRuntime', position: { x: 50, y: 50 }, parentNode: 'group-exec' },
		{ id: 'registry', label: 'Node Registry', position: { x: 42, y: 175 }, parentNode: 'group-exec' },
		{ id: 'functions', label: 'Node Functions', position: { x: 38, y: 300 }, parentNode: 'group-exec' },
	],
	edges: [
		{ id: 'e-main-blueprint', source: 'main', target: 'blueprint', label: '1. Loads', type: 'smoothstep', animated: true },
		{ id: 'e-main-runtime', source: 'main', target: 'runtime', label: '2. Creates & Configures', type: 'smoothstep', animated: true },
		{ id: 'e-runtime-blueprint', source: 'runtime', target: 'blueprint', label: 'Reads graph from', type: 'smoothstep', animated: true },
		{ id: 'e-runtime-registry', source: 'runtime', target: 'registry', label: 'Uses', type: 'smoothstep', animated: true },
		{ id: 'e-registry-functions', source: 'registry', target: 'functions', label: 'Maps string types to', type: 'smoothstep', animated: true },
	]
}

// Data for the Job Application Blueprint
export const job = {
	nodes: [
		{ id: 'a', label: 'Resume', position: { x: 58.75 + 200, y: 60 }, type: 'input' },
		{ id: 'b', label: 'Extract Skills', position: { x: 25 + 200, y: 150 } },
		{ id: 'c', label: 'Cover Letter', position: { x: 200 + 200, y: 60 }, type: 'input' },
		{ id: 'd', label: 'Analyze Tone', position: { x: 200 + 200, y: 150 } },
		{ id: 'e', label: 'Check Qualifications', position: { x: 90 + 200, y: 250 } },
		{ id: 'f', label: 'Sub-Workflow: Send Interview', position: { x: 70, y: 360 }, style: { borderColor: 'var(--vp-c-green-1)' } },
		{ id: 'g', label: 'Sub-Workflow: Send Rejection', position: { x: 440, y: 360 }, style: { borderColor: 'var(--vp-c-red-1)' } },
		{ id: 'h', label: 'Final Output', position: { x: 325, y: 460 }, type: 'output' },
	],
	edges: [
		{ id: 'e-ab', source: 'a', target: 'b', animated: true },
		{ id: 'e-cd', source: 'c', target: 'd', animated: true },
		{ id: 'e-be', source: 'b', target: 'e', animated: true },
		{ id: 'e-de', source: 'd', target: 'e', animated: true },
		{ id: 'e-ef', source: 'e', target: 'f', label: 'Interested' },
		{ id: 'e-eg', source: 'e', target: 'g', label: 'Not Interested' },
		{ id: 'e-fh', source: 'f', target: 'h' },
		{ id: 'e-gh', source: 'g', target: 'h' },
	]
}

// Data for the Customer Review Blueprint
export const review = {
	nodes: [
		{ id: 'a', label: 'Initial Review', position: { x: 300, y: 40 }, type: 'input' },
		{ id: 'b', label: 'Summarize', position: { x: 200, y: 120 } },
		{ id: 'c', label: 'Categorize', position: { x: 450, y: 120 } },
		{ id: 'd', label: 'Check Sentiment', position: { x: 300, y: 200 } },
		{ id: 'e', label: 'Sub-Workflow: Positive Reply', position: { x: 50, y: 320 }, style: { borderColor: 'var(--vp-c-green-1)' } },
		{ id: 'f', label: 'Sub-Workflow: Create Ticket & Reply', position: { x: 420, y: 320 }, style: { borderColor: 'var(--vp-c-red-1)' } },
		{ id: 'group-neg', data: { label: 'Negative Path (Parallel Fan-Out)' }, position: { x: 320, y: 420 }, style: { width: '520px', height: '140px', backgroundColor: 'rgba(255, 0, 0, 0.1)' } },
		{ id: 'g', label: 'Send to Ticketing System', position: { x: 20, y: 60 }, parentNode: 'group-neg' },
		{ id: 'h', label: 'Send Email to Customer', position: { x: 280, y: 60 }, parentNode: 'group-neg' },
		{ id: 'z', label: 'Final Step', position: { x: 200, y: 620 }, type: 'output' },
	],
	edges: [
		{ id: 'e-ab', source: 'a', target: 'b' },
		{ id: 'e-ac', source: 'a', target: 'c' },
		{ id: 'e-bd', source: 'b', target: 'd', animated: true },
		{ id: 'e-cd', source: 'c', target: 'd', animated: true },
		{ id: 'e-de', source: 'd', target: 'e', label: 'positive' },
		{ id: 'e-df', source: 'd', target: 'f', label: 'negative' },
		{ id: 'e-fg', source: 'f', target: 'g' },
		{ id: 'e-fh', source: 'f', target: 'h' },
		{ id: 'e-ez', source: 'e', target: 'z' },
		{ id: 'e-gz', source: 'g', target: 'z' },
		{ id: 'e-hz', source: 'h', target: 'z' },
	]
}

// Data for the Content Moderation Blueprint
export const moderation = {
	nodes: [
		{ id: 'a', label: 'User Post', position: { x: 300, y: 20 }, type: 'input' },
		{ id: 'b', label: 'Check for PII', position: { x: 50, y: 120 } },
		{ id: 'c', label: 'Check for Hate Speech', position: { x: 250, y: 120 } },
		{ id: 'd', label: 'Check for Spam', position: { x: 500, y: 120 } },
		{ id: 'e', label: 'Triage Post', position: { x: 292, y: 220 } },
		{ id: 'f', label: 'Sub-Workflow: Ban User', position: { x: -160, y: 360 }, style: { borderColor: 'var(--vp-c-red-1)' } },
		{ id: 'g', label: 'Sub-Workflow: Redact Post', position: { x: 90, y: 360 }, style: { borderColor: 'var(--vp-c-yellow-1)' } },
		{ id: 'h', label: 'Sub-Workflow: Delete Spam', position: { x: 370, y: 360 }, style: { borderColor: 'var(--vp-c-yellow-1)' } },
		{ id: 'i', label: 'Approve Post Branch', position: { x: 650, y: 360 }, style: { borderColor: 'var(--vp-c-green-1)' } },
		{ id: 'z', label: 'Final Log', position: { x: 300, y: 480 }, type: 'output' },
	],
	edges: [
		{ id: 'e-ab', source: 'a', target: 'b', animated: true },
		{ id: 'e-ac', source: 'a', target: 'c', animated: true },
		{ id: 'e-ad', source: 'a', target: 'd', animated: true },
		{ id: 'e-be', source: 'b', target: 'e', animated: true },
		{ id: 'e-ce', source: 'c', target: 'e', animated: true },
		{ id: 'e-de', source: 'd', target: 'e', animated: true },
		{ id: 'e-ef', source: 'e', target: 'f', animated: true, label: 'action_ban' },
		{ id: 'e-eg', source: 'e', target: 'g', animated: true, label: 'action_redact' },
		{ id: 'e-eh', source: 'e', target: 'h', animated: true, label: 'action_delete_spam' },
		{ id: 'e-ei', source: 'e', target: 'i', animated: true, label: 'action_approve' },
		{ id: 'e-fz', source: 'f', target: 'z', animated: true },
		{ id: 'e-gz', source: 'g', target: 'z', animated: true },
		{ id: 'e-hz', source: 'h', target: 'z', animated: true },
		{ id: 'e-iz', source: 'i', target: 'z', animated: true },
	]
}

