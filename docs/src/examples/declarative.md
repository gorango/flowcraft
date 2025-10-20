# Dynamic AI Agent from JSON Files

<script setup>
import { ref } from 'vue'

// Data for the Goal Diagram
const goalNodes = ref([
  { id: 'main', label: 'Entry', position: { x: 50, y: 0 }, type: 'input' },
  { id: 'group-def', data: { label: 'Workflow Definition' }, position: { x: -200, y: 200 }, style: { width: '250px', height: '140px', backgroundColor: 'rgba(52, 81, 178, 0.2)', 'z-index': -1 } },
  { id: 'blueprint', label: 'JSON Blueprint', data: { label: 'JSON Blueprint' }, position: { x: 50, y: 50 }, parentNode: 'group-def' },
  { id: 'group-exec', data: { label: 'Execution Logic' }, position: { x: 200, y: 200 }, style: { width: '250px', height: '400px', backgroundColor: 'rgba(52, 81, 178, 0.2)', 'z-index': -1 } },
  { id: 'runtime', label: 'FlowRuntime', position: { x: 50, y: 50 }, parentNode: 'group-exec' },
  { id: 'registry', label: 'Node Registry', position: { x: 50, y: 150 }, parentNode: 'group-exec' },
  { id: 'functions', label: 'Node Functions', position: { x: 50, y: 300 }, parentNode: 'group-exec' },
])
const goalEdges = ref([
  { id: 'e-main-blueprint', source: 'main', target: 'blueprint', label: '1. Loads' },
  { id: 'e-main-runtime', source: 'main', target: 'runtime', label: '2. Creates & Configures' },
  { id: 'e-runtime-blueprint', source: 'runtime', target: 'blueprint', label: 'Reads graph from' },
  { id: 'e-runtime-registry', source: 'runtime', target: 'registry', label: 'Uses' },
  { id: 'e-registry-functions', source: 'registry', target: 'functions', label: 'Maps string types to' },
])

// Data for the Blog Post Blueprint
const blogNodes = ref([
  { id: 'group', data: { label: 'Blog Post Generation (ID: 100)' }, position: { x: 0, y: 0 }, style: { width: '200px', height: '350px', backgroundColor: 'rgba(52, 81, 178, 0.2)' } },
  { id: 'a', label: 'generate_outline', position: { x: 25, y: 40 }, parentNode: 'group', type: 'input' },
  { id: 'b', label: 'draft_post', position: { x: 25, y: 120 }, parentNode: 'group' },
  { id: 'c', label: 'suggest_titles', position: { x: 25, y: 200 }, parentNode: 'group' },
  { id: 'd', label: 'final_output', position: { x: 25, y: 280 }, parentNode: 'group', type: 'output' },
])
const blogEdges = ref([
  { id: 'e-ab', source: 'a', target: 'b', animated: true },
  { id: 'e-bc', source: 'b', target: 'c', animated: true },
  { id: 'e-cd', source: 'c', target: 'd', animated: true },
])

// Data for the Job Application Blueprint
const jobAppNodes = ref([
  { id: 'group', data: { label: 'Job Application Screener (ID: 200)' }, position: { x: 0, y: 0 }, style: { width: '500px', height: '400px', backgroundColor: 'rgba(52, 81, 178, 0.2)' } },
  { id: 'a', label: 'Resume', position: { x: 25, y: 50 }, parentNode: 'group', type: 'input' },
  { id: 'b', label: 'extract_skills', position: { x: 25, y: 150 }, parentNode: 'group' },
  { id: 'c', label: 'Cover Letter', position: { x: 200, y: 50 }, parentNode: 'group', type: 'input' },
  { id: 'd', label: 'analyze_tone', position: { x: 200, y: 150 }, parentNode: 'group' },
  { id: 'e', label: 'check_qualifications', position: { x: 112, y: 225 }, parentNode: 'group' },
  { id: 'f', label: 'Sub-Workflow: Send Interview (201)', position: { x: 25, y: 300 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-green-1)' } },
  { id: 'g', label: 'Sub-Workflow: Send Rejection (202)', position: { x: 250, y: 300 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-red-1)' } },
  { id: 'h', label: 'final_output', position: { x: 175, y: 360 }, parentNode: 'group', type: 'output' },
])
const jobAppEdges = ref([
  { id: 'e-ab', source: 'a', target: 'b' },
  { id: 'e-cd', source: 'c', target: 'd' },
  { id: 'e-be', source: 'b', target: 'e', animated: true },
  { id: 'e-de', source: 'd', target: 'e', animated: true },
  { id: 'e-ef', source: 'e', target: 'f', label: 'true' },
  { id: 'e-eg', source: 'e', target: 'g', label: 'false' },
  { id: 'e-fh', source: 'f', target: 'h' },
  { id: 'e-gh', source: 'g', target: 'h' },
])

// Data for the Customer Review Blueprint
const reviewNodes = ref([
  { id: 'group', data: { label: 'Customer Review Analysis (ID: 300)' }, position: { x: 0, y: 0 }, style: { width: '550px', height: '550px', backgroundColor: 'rgba(52, 81, 178, 0.2)' } },
  { id: 'a', label: 'Initial Review', position: { x: 200, y: 40 }, parentNode: 'group', type: 'input' },
  { id: 'b', label: 'summarize', position: { x: 50, y: 120 }, parentNode: 'group' },
  { id: 'c', label: 'categorize', position: { x: 350, y: 120 }, parentNode: 'group' },
  { id: 'd', label: 'check_sentiment', position: { x: 200, y: 200 }, parentNode: 'group' },
  { id: 'e', label: 'Sub-Workflow: Positive Reply (301)', position: { x: 50, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-green-1)' } },
  { id: 'f', label: 'Sub-Workflow: Create Ticket & Reply (302)', position: { x: 350, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-red-1)' } },
  { id: 'group-neg', data: { label: 'Negative Path (Parallel Fan-Out)' }, position: { x: 275, y: 350 }, parentNode: 'group', style: { width: '250px', height: '120px', backgroundColor: 'rgba(255, 0, 0, 0.1)' } },
  { id: 'g', label: 'send_to_ticketing_system', position: { x: 25, y: 30 }, parentNode: 'group-neg' },
  { id: 'h', label: 'send_email_to_customer', position: { x: 25, y: 80 }, parentNode: 'group-neg' },
  { id: 'z', label: 'final_step', position: { x: 200, y: 490 }, parentNode: 'group', type: 'output' },
])
const reviewEdges = ref([
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
])

// Data for the Content Moderation Blueprint
const moderationNodes = ref([
  { id: 'group', data: { label: 'Content Moderation (ID: 400)' }, position: { x: 0, y: 0 }, style: { width: '700px', height: '450px', backgroundColor: 'rgba(52, 81, 178, 0.2)' } },
  { id: 'a', label: 'User Post', position: { x: 300, y: 40 }, parentNode: 'group', type: 'input' },
  { id: 'b', label: 'check_for_pii', position: { x: 50, y: 120 }, parentNode: 'group' },
  { id: 'c', label: 'check_for_hate_speech', position: { x: 275, y: 120 }, parentNode: 'group' },
  { id: 'd', label: 'check_for_spam', position: { x: 500, y: 120 }, parentNode: 'group' },
  { id: 'e', label: 'triage_post', position: { x: 300, y: 200 }, parentNode: 'group' },
  { id: 'f', label: 'Sub-Workflow: Ban User (401)', position: { x: 25, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-red-1)' } },
  { id: 'g', label: 'Sub-Workflow: Redact Post (402)', position: { x: 190, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-yellow-1)' } },
  { id: 'h', label: 'Sub-Workflow: Delete Spam (403)', position: { x: 355, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-yellow-1)' } },
  { id: 'i', label: 'approve_post_branch', position: { x: 520, y: 280 }, parentNode: 'group', style: { borderColor: 'var(--vp-c-green-1)' } },
  { id: 'z', label: 'final_log', position: { x: 300, y: 380 }, parentNode: 'group', type: 'output' },
])
const moderationEdges = ref([
  { id: 'e-ab', source: 'a', target: 'b' },
  { id: 'e-ac', source: 'a', target: 'c' },
  { id: 'e-ad', source: 'a', target: 'd' },
  { id: 'e-be', source: 'b', target: 'e', animated: true },
  { id: 'e-ce', source: 'c', target: 'e', animated: true },
  { id: 'e-de', source: 'd', target: 'e', animated: true },
  { id: 'e-ef', source: 'e', target: 'f', label: 'action_ban' },
  { id: 'e-eg', source: 'e', target: 'g', label: 'action_redact' },
  { id: 'e-eh', source: 'e', target: 'h', label: 'action_delete_spam' },
  { id: 'e-ei', source: 'e', target: 'i', label: 'action_approve' },
  { id: 'e-fz', source: 'f', target: 'z' },
  { id: 'e-gz', source: 'g', target: 'z' },
  { id: 'e-hz', source: 'h', target: 'z' },
  { id: 'e-iz', source: 'i', target: 'z' },
])
</script>

[[view source code]](https://github.com/gorango/flowcraft/tree/master/examples/4a.declarative-in-memory)

This example demonstrates a runtime engine that can execute complex, graph-based AI workflows defined as simple JSON files. It showcases how to build a powerful AI agent that can reason, branch, and call other workflows recursively using the workflow framework.

## The Goal

Demonstrate a runtime engine that executes complex, graph-based AI workflows defined as JSON files, with support for parallelism, branching, and nested workflows.

<Flow :nodes="goalNodes" :edges="goalEdges" style="height: 600px" />

## The Blueprints

#### [`blog-post`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/1.blog-post)

<Flow :nodes="blogNodes" :edges="blogEdges" />

#### [`job-application`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/2.job-application)

<Flow :nodes="jobAppNodes" :edges="jobAppEdges" />

#### [`customer-review`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/3.customer-review)

<Flow :nodes="reviewNodes" :edges="reviewEdges" />

#### [`content-moderation`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/4.content-moderation)

<Flow :nodes="moderationNodes" :edges="moderationEdges" />


## The Code

#### `nodes.ts`
Defines node functions for processing LLM tasks, including resolving inputs, handling conditions, routing, and generating output based on workflow parameters.

```typescript
import type { IAsyncContext, NodeContext, NodeResult, RuntimeDependencies } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils.js'

// ... (rest of the code remains the same)
```

#### `utils.ts`
Provides utility functions for interacting with the OpenAI API to call LLMs and for resolving template strings with dynamic data.

```typescript
import OpenAI from 'openai'
import 'dotenv/config'

// ... (rest of the code remains the same)
```

#### `registry.ts`
Creates a node registry that maps string identifiers to their corresponding function implementations for use in the workflow runtime.

```typescript
import type { NodeRegistry } from 'flowcraft'
import { llmCondition, llmProcess, llmRouter, outputNode } from './nodes.js'

// ... (rest of the code remains the same)
```

#### `blueprints.ts`
Loads JSON workflow definitions from files, processes them into WorkflowBlueprint objects, and handles node configurations for convergence points.

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'

// ... (rest of the code remains the same)
```

#### `config.ts`
Defines configuration objects for various use cases, specifying the entry workflow ID and initial context data for each scenario.

```typescript
// The configuration object defines the different scenarios this example can run.
export const config = {
	'1.blog-post': {
		entryWorkflowId: '100',
		initialContext: {
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		},
	},
// ... (rest of the code remains the same)
```

#### `main.ts`
Serves as the entry point, initializing the FlowRuntime with the node registry and blueprints, then executing the specified workflow with initial context.

```typescript
import { FlowRuntime } from 'flowcraft'
import { blueprints } from './blueprints.js'
import { config } from './config.js'
import { agentNodeRegistry } from './registry.js'

// ... (rest of the code remains the same)```

---

[[view source code]](https://github.com/gorango/flowcraft/tree/master/examples/4a.declarative-in-memory)
