# LLM Integration

[![npm version](https://img.shields.io/npm/v/@flowcraft/tools.svg)](https://www.npmjs.com/package/@flowcraft/tools)

A collection of Zod-based tool definitions that let LLMs compose, orchestrate, and monitor workflows. These tools are framework-agnostic with thin adapters for Vercel AI SDK, LangChain, OpenAI, and Anthropic.

## Installation

```bash
npm install @flowcraft/tools
```

Optional peer dependencies for framework adapters:

```bash
npm install ai @ai-sdk/openai               # Vercel AI SDK
npm install @langchain/core langchain       # LangChain
npm install openai                          # OpenAI
npm install @anthropic-ai/sdk               # Anthropic
```

## Quick Start

### With Vercel AI SDK

```typescript
import { FlowRuntime } from 'flowcraft'
import { DirectResolver } from '@flowcraft/tools/resolve'
import { createRunWorkflowTool, createCheckStatusTool } from '@flowcraft/tools/orchestrate'
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
import { createListWorkflowsTool, createGetWorkflowTool } from '@flowcraft/tools/discover'

const tools = toLangChainTools([
	createListWorkflowsTool({ resolver: dbResolver }),
	createGetWorkflowTool({ resolver: dbResolver }),
])

const agent = initializeAgentExecutorWithOptions(tools, llm, {
	agentType: 'openai-functions',
})
```

## Architecture

`@flowcraft/tools` is organized in three abstraction layers:

1. **Tool Definitions** — Zod-based, framework-agnostic `WorkflowTool` objects that define input schemas, output schemas, and execute handlers
2. **Tool Groups** — Curated sets of tools organized by use case (`compose`, `orchestrate`, `actions`, `discover`)
3. **Framework Adapters** — Thin conversion functions (`toVercelTools`, `toLangChainTools`, `toOpenAISchemas`, `toAnthropicTools`)

## Tool Groups

### Compose (`@flowcraft/tools/compose`)

Tools for creating, modifying, and analyzing workflow blueprints from natural language:

| Tool                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `create_workflow`            | Generate a blueprint from natural language        |
| `modify_workflow`            | Add, remove, or edit nodes and edges              |
| `validate_workflow`          | Check for errors, cycles, unreachable nodes       |
| `describe_workflow`          | Human-readable description of a blueprint         |
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
} from '@flowcraft/tools/compose'

const tools = [
	createCreateBlueprintTool({ generate: myBlueprintGenerator }),
	createValidateBlueprintTool(),
	createCheckNodeImplementationsTool({ registry: myRegistry }),
	createGenerateFromTemplateTool({ templates: myTemplateStore }),
]
```

### Orchestrate (`@flowcraft/tools/orchestrate`)

Tools for executing and monitoring workflow runs:

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
} from '@flowcraft/tools/orchestrate'

const tools = [
	createRunWorkflowTool({ resolver, runtime, asyncStore }),
	createResumeWorkflowTool({ resolver, runtime, eventStore }),
	createRetryFailedNodesTool({ eventStore, runtime, resolver }),
	createGetExecutionTimelineTool({ eventStore }),
]
```

### Actions (`@flowcraft/tools/actions`)

Generate per-node tools from a specific blueprint for fine-grained control:

```typescript
import { createNodeActionTools } from '@flowcraft/tools/actions'

const tools = createNodeActionTools(orderBlueprint, {
	runtime,
	nodes: [
		{ nodeId: 'validate-order', description: 'Validate an order before processing' },
		{ nodeId: 'process-payment', description: 'Charge the customer payment' },
	],
})
// Returns tools prefixed with the workflow ID, e.g. order-processing__validate-order
```

Additional per-node action tools:

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

Tools for discovering available workflows and executions:

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

### Resolve (`@flowcraft/tools/resolve`)

Blueprint resolution strategies for providing blueprints to tools:

```typescript
import {
	DirectResolver,
	RegistryResolver,
	DatabaseResolver,
	CompositeResolver,
} from '@flowcraft/tools/resolve'

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

## Blueprint Generation

The `create_workflow` tool needs a blueprint generator function. Provide your own using any LLM:

```typescript
import { createCreateBlueprintTool } from '@flowcraft/tools/compose'

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

For long-running workflows, use async mode to start execution in the background and poll for results:

```typescript
import { createRunWorkflowTool, createAsyncExecutionStore } from '@flowcraft/tools'
import { createCheckStatusTool } from '@flowcraft/tools/orchestrate'

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

## AI-Assisted Development with Skills

In addition to agent tooling, the [`@flowcraft/skills`](https://github.com/gorango/flowcraft/tree/master/packages/skills) package provides structured knowledge modules that AI assistants use to help developers build, debug, and scale workflows. These skills cover:

- **Building Workflows** — Fluent API, declarative blueprints, patterns, and examples
- **Debugging Workflows** — Testing utilities, event assertions, time-travel replay, common errors
- **Scaling Workflows** — Distributed adapters, middleware, durable primitives
- **Compiler Workflows** — Imperative-to-declarative compilation
- **Extending Flowcraft** — Custom serializers, evaluators, loggers, orchestrators
- **Workflow Analysis** — Static analysis, visualization, CLI tools

These skills are designed for AI assistant consumption and are referenced automatically when an assistant recognizes relevant development scenarios.
