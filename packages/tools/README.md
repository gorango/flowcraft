# `@flowcraft/tools`

AI agent tools for composing, orchestrating, and executing Flowcraft workflows. Framework-agnostic Zod-based tool definitions with thin adapters for Vercel AI SDK, LangChain, OpenAI, and Anthropic.

## Installation

```bash
npm install @flowcraft/tools
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

Three layers of abstraction:

1. **Tool Definitions** — Zod-based, framework-agnostic `WorkflowTool` objects
2. **Tool Groups** — Curated sets for each use case (`compose`, `orchestrate`, `actions`, `discover`)
3. **Framework Adapters** — Thin bridges to Vercel AI SDK, LangChain, OpenAI, Anthropic

## Tool Groups

### Compose (`@flowcraft/tools/compose`)

Tools for creating and modifying workflow blueprints:

| Tool                | Description                                 |
| ------------------- | ------------------------------------------- |
| `create_workflow`   | Generate a blueprint from natural language  |
| `modify_workflow`   | Add, remove, or edit nodes and edges        |
| `validate_workflow` | Check for errors, cycles, unreachable nodes |
| `describe_workflow` | Human-readable description of blueprint     |

```typescript
import { createCreateBlueprintTool, createValidateBlueprintTool } from '@flowcraft/tools/compose'

const tools = [
	createCreateBlueprintTool({ generate: myBlueprintGenerator }),
	createValidateBlueprintTool(),
]
```

### Orchestrate (`@flowcraft/tools/orchestrate`)

Tools for executing workflows:

| Tool                    | Description                        |
| ----------------------- | ---------------------------------- |
| `run_workflow`          | Execute a workflow (sync or async) |
| `resume_workflow`       | Resume an awaiting workflow        |
| `check_workflow_status` | Poll execution status              |
| `cancel_workflow`       | Cancel a running workflow          |

```typescript
import { createRunWorkflowTool, createResumeWorkflowTool } from '@flowcraft/tools/orchestrate'

const tools = [
	createRunWorkflowTool({ resolver, runtime, asyncStore }),
	createResumeWorkflowTool({ resolver, runtime, eventStore }),
]
```

### Actions (`@flowcraft/tools/actions`)

Generate per-node tools from a blueprint (opt-in):

```typescript
import { createNodeActionTools } from '@flowcraft/tools/actions'

const tools = createNodeActionTools(orderBlueprint, {
	runtime,
	nodes: [
		{ nodeId: 'validate-order', description: 'Validate an order before processing' },
		{ nodeId: 'process-payment', description: 'Charge the customer payment' },
	],
})
// Returns tools: order-processing__validate-order, order-processing__process-payment
```

### Discover (`@flowcraft/tools/discover`)

Tools for discovering workflows and executions:

| Tool              | Description                           |
| ----------------- | ------------------------------------- |
| `list_workflows`  | List available workflow blueprints    |
| `get_workflow`    | Get details about a specific workflow |
| `list_executions` | List recent executions                |
| `get_execution`   | Get detailed execution info           |

```typescript
import { createListWorkflowsTool, createGetExecutionTool } from '@flowcraft/tools/discover'

const tools = [
	createListWorkflowsTool({ resolver: dbResolver }),
	createGetExecutionTool({ eventStore }),
]
```

### Resolve (`@flowcraft/tools/resolve`)

Blueprint resolution strategies:

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

### Adapters (`@flowcraft/tools/adapters`)

Framework-specific tool conversion:

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

## Blueprint Generation

The `create_workflow` tool needs a blueprint generator function. You can provide your own or use the default:

```typescript
import { createCreateBlueprintTool } from '@flowcraft/tools/compose'

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
