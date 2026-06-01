# `@flowcraft/tools`

AI agent tools for composing, orchestrating, and executing Flowcraft workflows. Framework-agnostic Zod-based tool definitions with thin adapters for Vercel AI SDK, LangChain, OpenAI, and Anthropic.

All tools are importable from the root entry point. Adapters are available at `@flowcraft/tools/adapters`.

## Installation

```bash
npm install @flowcraft/tools
```

## Quick Start

### With Vercel AI SDK

```typescript
import { FlowRuntime } from 'flowcraft'
import { DirectResolver, createRunWorkflowTool, createCheckStatusTool } from '@flowcraft/tools'
import { toVercelTools } from '@flowcraft/tools/adapters'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const runtime = new FlowRuntime()
const resolver = new DirectResolver({ 'order-processing': orderBlueprint })

const tools = toVercelTools([
	createRunWorkflowTool({ resolver, runtime }),
	createCheckStatusTool({ eventStore }),
])

const result = await generateText({
	model: openai('gpt-4'),
	tools,
	prompt: 'Run the order-processing workflow with orderId "ORD-123"',
})
```

### With LangChain

```typescript
import { toLangChainTools } from '@flowcraft/tools/adapters'
import { createListWorkflowsTool, createGetWorkflowTool } from '@flowcraft/tools'

const tools = toLangChainTools([
	createListWorkflowsTool({ resolver: dbResolver }),
	createGetWorkflowTool({ resolver: dbResolver }),
])

const agent = initializeAgentExecutorWithOptions(tools, llm, {
	agentType: 'openai-functions',
})
```

## Architecture

Three layers of abstraction:

1. **Tool Definitions** — Zod-based, framework-agnostic `WorkflowTool` objects
2. **Tool Groups** — Curated sets for each use case (`compose`, `orchestrate`, `actions`, `discover`)
3. **Framework Adapters** — Thin bridges to Vercel AI SDK, LangChain, OpenAI, Anthropic

## Triggers

Every curated tool carries an optional `triggers?: string[]` field — a curated list of natural-language phrases and synonyms (e.g. `'run'`, `'execute'`, `'kick off'`, `'launch workflow'` for `run_workflow`) that help agents and orchestrators select the right tool from free-form input.

```typescript
import { createRunWorkflowTool } from '@flowcraft/tools'

const run = createRunWorkflowTool({ resolver, runtime })
console.log(run.triggers)
// => ['run', 'execute', 'start', 'kick off', 'launch workflow', ...]
```

Adapters do **not** surface `triggers` on the framework-specific tool shape. Read the field directly off the `WorkflowTool` before passing it through an adapter if you need it.

Custom tools you build with `createWorkflowTool` can declare their own `triggers` in the config:

```typescript
import { createWorkflowTool } from '@flowcraft/tools'
import { z } from 'zod'

const myTool = createWorkflowTool({
	name: 'send_invoice',
	description: 'Send an invoice to a customer',
	parameters: z.object({ customerId: z.string() }),
	triggers: ['send invoice', 'bill customer', 'invoice'],
	execute: async (params) => ({ status: 'completed' }),
})
```

For per-node generated tools (`createNodeActionTools`), pass `triggers` on each `NodeActionConfig` to opt in:

```typescript
import { createNodeActionTools } from '@flowcraft/tools'

const tools = createNodeActionTools(blueprint, {
	runtime,
	nodes: [{ nodeId: 'charge-card', triggers: ['charge', 'bill card', 'take payment'] }],
})
```

## Tool Groups

### Compose

Tools for creating, modifying, and analyzing workflow blueprints:

| Tool                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `create_workflow`            | Generate a blueprint from natural language        |
| `modify_workflow`            | Add, remove, or edit nodes and edges              |
| `validate_workflow`          | Check for errors, cycles, unreachable nodes       |
| `describe_workflow`          | Human-readable description of blueprint           |
| `generate_from_template`     | Create a blueprint from a named template          |
| `check_node_implementations` | Verify all `uses` keys have implementations       |
| `check_data_flow`            | Validate input/output compatibility between nodes |
| `add_retry_config`           | Add retry configuration to nodes                  |
| `add_fallback_node`          | Add fallback routing for error handling           |
| `optimize_for_parallelism`   | Analyze and suggest parallelism improvements      |
| `simulate_execution`         | Dry-run workflow with sample data                 |
| `get_blueprint_diff`         | Compare two blueprint versions                    |

```typescript
import {
	createCreateBlueprintTool,
	createValidateBlueprintTool,
	createCheckNodeImplementationsTool,
	createGenerateFromTemplateTool,
} from '@flowcraft/tools'

const tools = [
	createCreateBlueprintTool({ generate: myBlueprintGenerator }),
	createValidateBlueprintTool(),
	createCheckNodeImplementationsTool({ registry: myRegistry }),
	createGenerateFromTemplateTool({ templates: myTemplateStore }),
]
```

### Orchestrate

Tools for executing and monitoring workflows:

| Tool                       | Description                               |
| -------------------------- | ----------------------------------------- |
| `run_workflow`             | Execute a workflow (sync or async)        |
| `resume_workflow`          | Resume an awaiting workflow               |
| `check_workflow_status`    | Poll execution status                     |
| `cancel_workflow`          | Cancel a running workflow                 |
| `pause_workflow`           | Pause running workflow at next checkpoint |
| `retry_failed_nodes`       | Retry only failed nodes in execution      |
| `skip_failed_node`         | Mark failed node as skipped, continue     |
| `restart_from_node`        | Re-run workflow from a specific node      |
| `rollback_execution`       | Undo completed nodes to restore state     |
| `request_approval`         | Trigger approval request to human         |
| `get_execution_context`    | Retrieve full context at current state    |
| `get_awaiting_nodes`       | List nodes waiting for input              |
| `get_error_diagnosis`      | Get AI-friendly error analysis            |
| `get_execution_timeline`   | Get detailed node execution timestamps    |
| `get_execution_metrics`    | Get success rate, duration, cost stats    |
| `watch_execution`          | Stream real-time execution events         |
| `run_workflows_sequential` | Run multiple workflows in order           |
| `run_workflows_parallel`   | Run multiple workflows concurrently       |
| `batch_execute`            | Run same workflow with multiple inputs    |

```typescript
import {
	createRunWorkflowTool,
	createResumeWorkflowTool,
	createRetryFailedNodesTool,
	createGetExecutionTimelineTool,
} from '@flowcraft/tools'

const tools = [
	createRunWorkflowTool({ resolver, runtime, asyncStore }),
	createResumeWorkflowTool({ resolver, runtime, eventStore }),
	createRetryFailedNodesTool({ eventStore, runtime, resolver }),
	createGetExecutionTimelineTool({ eventStore }),
]
```

### Actions

Generate per-node tools from a blueprint (opt-in):

```typescript
import { createNodeActionTools } from '@flowcraft/tools'
```

| Tool                    | Description                               |
| ----------------------- | ----------------------------------------- |
| `get_node_info`         | Get node definition, config, and metadata |
| `check_node_readiness`  | Check if node's predecessors completed    |
| `get_node_output`       | Get a completed node's output             |
| `get_node_error`        | Get detailed error from failed node       |
| `retry_node`            | Re-execute a failed node                  |
| `skip_node`             | Mark node as skipped without execution    |
| `set_node_complete`     | Manually mark node as done with output    |
| `pause_before_node`     | Set breakpoint before node execution      |
| `request_node_approval` | Pause and wait for human approval         |
| `transform_node_input`  | Modify input before node execution        |
| `patch_node_context`    | Modify context keys for a node            |
| `execute_nodes_up_to`   | Run workflow until specific node          |
| `execute_node_batch`    | Run multiple nodes in parallel            |

### Discover

Tools for discovering workflows and executions:

| Tool              | Description                           |
| ----------------- | ------------------------------------- |
| `list_workflows`  | List available workflow blueprints    |
| `get_workflow`    | Get details about a specific workflow |
| `list_executions` | List recent executions                |
| `get_execution`   | Get detailed execution info           |

```typescript
import {
	createListWorkflowsTool,
	createGetWorkflowTool,
	createListExecutionsTool,
	createGetExecutionTool,
} from '@flowcraft/tools'

const tools = [
	createListWorkflowsTool({ resolver: dbResolver }),
	createGetWorkflowTool({ resolver: dbResolver }),
	createListExecutionsTool({ eventStore }),
	createGetExecutionTool({ eventStore }),
]
```

### Resolve

Blueprint resolution strategies:

```typescript
import {
	DirectResolver,
	RegistryResolver,
	DatabaseResolver,
	CompositeResolver,
} from '@flowcraft/tools'
```

### Utilities

Shared utilities for event parsing and graph analysis:

```typescript
import {
	getCompletedNodes,
	getNodeErrors,
	reconstructContext,
	getExecutionStatus,
	getAwaitingNodes,
	normalizeResult,
	createAsyncExecutionStore,
} from '@flowcraft/tools'

import {
	getPredecessors,
	getSuccessors,
	haveAllPredecessorsCompleted,
	getExecutionOrder,
	findOrphanNodes,
	getDataFlow,
} from '@flowcraft/tools'
```

Additional per-node action tools available:

| Tool                    | Description                               |
| ----------------------- | ----------------------------------------- |
| `get_node_info`         | Get node definition, config, and metadata |
| `check_node_readiness`  | Check if node's predecessors completed    |
| `get_node_output`       | Get a completed node's output             |
| `get_node_error`        | Get detailed error from failed node       |
| `retry_node`            | Re-execute a failed node                  |
| `skip_node`             | Mark node as skipped without execution    |
| `set_node_complete`     | Manually mark node as done with output    |
| `pause_before_node`     | Set breakpoint before node execution      |
| `request_node_approval` | Pause and wait for human approval         |
| `transform_node_input`  | Modify input before node execution        |
| `patch_node_context`    | Modify context keys for a node            |
| `execute_nodes_up_to`   | Run workflow until specific node          |
| `execute_node_batch`    | Run multiple nodes in parallel            |

### Discover (`@flowcraft/tools/discover`)

Tools for discovering workflows and executions:

| Tool              | Description                           |
| ----------------- | ------------------------------------- |
| `list_workflows`  | List available workflow blueprints    |
| `get_workflow`    | Get details about a specific workflow |
| `list_executions` | List recent executions                |
| `get_execution`   | Get detailed execution info           |

```typescript
import {
	createListWorkflowsTool,
	createGetWorkflowTool,
	createListExecutionsTool,
	createGetExecutionTool,
} from '@flowcraft/tools/discover'

const tools = [
	createListWorkflowsTool({ resolver: dbResolver }),
	createGetWorkflowTool({ resolver: dbResolver }),
	createListExecutionsTool({ eventStore }),
	createGetExecutionTool({ eventStore }),
]
```

### Resolve

Blueprint resolution strategies:

```typescript
import {
	DirectResolver,
	RegistryResolver,
	DatabaseResolver,
	CompositeResolver,
} from '@flowcraft/tools'

// Direct: blueprint provided directly
const direct = new DirectResolver({ 'my-flow': myBlueprint })

// Registry: lookup in FlowRuntime
const registry = new RegistryResolver(runtime, blueprints)

// Database: query external store
const db = new DatabaseResolver({
	find: ({ id, version }) => db.blueprints.find({ id, version }),
	list: ({ limit, offset }) => db.blueprints.list({ limit, offset }),
})

// Composite: try multiple resolvers in order
const composite = new CompositeResolver([registry, db])
```

### Utilities

Shared utilities for event parsing and graph analysis:

```typescript
import {
	getCompletedNodes,
	getNodeErrors,
	reconstructContext,
	getExecutionStatus,
	getAwaitingNodes,
} from '@flowcraft/tools'

import {
	getPredecessors,
	getSuccessors,
	haveAllPredecessorsCompleted,
	getExecutionOrder,
	findOrphanNodes,
	getDataFlow,
} from '@flowcraft/tools'
```

### Adapters

Framework-specific tool conversion (separate entrypoint to avoid pulling in peer deps):

```typescript
import {
	toVercelTools,
	toLangChainTools,
	toOpenAISchemas,
	toAnthropicTools,
} from '@flowcraft/tools/adapters'

const vercelTools = toVercelTools(workflowTools)
const langchainTools = toLangChainTools(workflowTools)
const openaiSchemas = toOpenAISchemas(workflowTools)
const anthropicTools = toAnthropicTools(workflowTools)
```

### Helpers

Factory functions that create all tools for a group — or all groups at once — from a single config bag. Tools are automatically excluded when their required dependencies are missing.

```typescript
import { createAllTools, createOrchestrateTools } from '@flowcraft/tools'

const deps = {
	resolver,
	runtime,
	eventStore,
	generate: myBlueprintGenerator,
	templates: myTemplateStore,
}

// All tools from every group
const allTools = createAllTools(deps)

// Tools from a single group
const orchestrateTools = createOrchestrateTools(deps)
```

Each helper accepts a `ToolsDeps` object where every field is optional:

| Dep              | Required by                             |
| ---------------- | --------------------------------------- |
| `resolver`       | Compose, Actions, Discover, Orchestrate |
| `runtime`        | Actions, Orchestrate                    |
| `eventStore`     | Actions, Discover, Orchestrate          |
| `generate`       | `createCreateBlueprintTool`             |
| `templates`      | `createGenerateFromTemplateTool`        |
| `registry`       | `createCheckNodeImplementationsTool`    |
| `asyncStore`     | `createRunWorkflowTool` (async mode)    |
| `controllers`    | `createCancelWorkflowTool`              |
| `database`       | `createListWorkflowsTool`               |
| `executionIndex` | `createListExecutionsTool`              |

## Blueprint Generation

The `create_workflow` tool needs a blueprint generator function. You can provide your own or use the default:

```typescript
import { createCreateBlueprintTool } from '@flowcraft/tools'

// Custom generator using your preferred LLM
const tool = createCreateBlueprintTool({
	generate: async ({ description, nodes }) => {
		const response = await generateText({
			model: openai('gpt-4'),
			prompt: `Generate a Flowcraft blueprint for: ${description}`,
		})
		return parseBlueprint(response.text)
	},
})
```

## Async Execution

For long-running workflows, use async mode to start execution in the background:

```typescript
import { createRunWorkflowTool, createAsyncExecutionStore } from '@flowcraft/tools'

const asyncStore = createAsyncExecutionStore()

const runTool = createRunWorkflowTool({
	resolver,
	runtime,
	asyncStore,
})

// Start in background
const result = await runTool.execute({
	workflowId: 'long-process',
	params: { data: '...' },
	mode: 'async',
})

console.log(result.executionId) // Use with check_workflow_status later
```

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
