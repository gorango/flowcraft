# Orchestrators

Orchestrators define how a workflow is executed. By default, Flowcraft uses `DefaultOrchestrator`. Custom orchestrators enable different execution strategies.

## The IOrchestrator Interface

```typescript
interface IOrchestrator {
	run(
		context: ExecutionContext<any, any>,
		traverser: GraphTraverser,
	): Promise<WorkflowResult<any>>
}
```

## DefaultOrchestrator

The standard orchestrator. Runs a workflow from start to finish, gracefully pausing at wait nodes or awaiting subflows. Designed for human-in-the-loop workflows.

```typescript
import { DefaultOrchestrator } from 'flowcraft'

const runtime = new FlowRuntime() // Uses DefaultOrchestrator by default
```

**Behavior:**

- Executes batches of ready nodes respecting concurrency limits
- Supports `AbortSignal` cancellation
- Pauses at wait nodes (status becomes `'awaiting'`)
- Handles resumption via `runtime.resume()`

## StepByStepOrchestrator

Executes only one "turn" — a single batch of ready nodes. Designed for debugging, interactive tools, or fine-grained testing.

```typescript
import { FlowRuntime, StepByStepOrchestrator, GraphTraverser, WorkflowState } from 'flowcraft'

const state = new WorkflowState({})
const traverser = new GraphTraverser(blueprint)
const orchestrator = new StepByStepOrchestrator()

// Step through nodes one batch at a time
let result = await orchestrator.run(context, traverser)
console.log('After Step 1:', result.context)

result = await orchestrator.run(context, traverser)
console.log('After Step 2:', result.context)

// Continue until traverser.hasMoreWork() returns false
```

**Use cases:**

- Interactive debugging
- Testing intermediate state
- Building step-through debuggers

## EventDrivenOrchestrator

Powers distributed adapters. Instead of a self-contained loop, it provides a `handleJob` method triggered externally for each node.

```typescript
class EventDrivenOrchestrator {
	constructor(
		private services: ExecutionServices,
		private coordinationStore: ICoordinationStore,
	) {}

	async handleJob(
		nodeId: string,
		blueprint: WorkflowBlueprint,
		state: WorkflowState,
		runId: string,
	): Promise<{ nodesToEnqueue: string[] }> {
		// 1. Execute the node
		// 2. Determine successors based on result
		// 3. Check fan-in readiness (atomic in distributed env)
		// 4. Return nodes to enqueue
	}
}
```

**Use cases:**

- Building custom distributed adapters
- Queue-based execution (BullMQ, SQS, etc.)
- Event-driven architectures

## ResumptionOrchestrator

Resumes a previously stalled workflow. Reconciles saved state to determine the correct starting frontier, then delegates to another orchestrator.

```typescript
import { ResumptionOrchestrator, DefaultOrchestrator } from 'flowcraft'

const orchestrator = new ResumptionOrchestrator(new DefaultOrchestrator())

// 1. Reconciliation phase — determines which nodes are ready
// 2. Updates traverser frontier
// 3. Delegates to subsequent orchestrator
```

**Use cases:**

- Resuming workflows after process restart
- Recovering from crashes
- Long-running workflows with persisted state

## Helper Functions

`executeBatch` and `processResults` are exported from `flowcraft` for building custom orchestrators:

```typescript
import { executeBatch, processResults } from 'flowcraft'

// Execute a batch of ready nodes
const settledResults = await executeBatch(
	readyNodes,
	traverser.getDynamicBlueprint(),
	state,
	executorFactory,
	services,
	concurrency,
)

// Process results to update state and determine next frontier
await processResults(settledResults, traverser, state, services)
```
