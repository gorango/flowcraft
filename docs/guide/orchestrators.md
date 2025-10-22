# Orchestrators

Orchestrators define how a workflow is executed. By default, Flowcraft uses the [`RunToCompletionOrchestrator`](/api/orchestrators#runtocompletionorchestrator-class), but you can implement custom orchestrators for different execution strategies.

## Orchestrator Examples

### 1. `RunToCompletionOrchestrator` (Default)

This is the standard orchestrator that runs a workflow from start to finish in a single, blocking operation.

#### Implementation

```typescript
import type { GraphTraverser, WorkflowState, IOrchestrator, NodeExecutorFactory, ExecutionServices, WorkflowResult } from 'flowcraft'
import { executeBatch, processResults } from 'flowcraft'

/**
 * The default orchestration strategy. It executes a workflow from its starting
 * nodes until no more nodes can be run (i.e., until completion, failure, or a stall).
 * This orchestrator contains the main execution loop.
 */
export class RunToCompletionOrchestrator implements IOrchestrator {
    public async run(
        traverser: GraphTraverser,
        executorFactory: NodeExecutorFactory,
        state: WorkflowState<any>,
        services: ExecutionServices,
    ): Promise<WorkflowResult<any>> {
        const { signal, concurrency, serializer } = services.options

        // The main execution loop. It continues as long as the traverser
        // reports that there are nodes ready to be executed.
        while (traverser.hasMoreWork()) {
            // Abort if a cancellation signal is received.
            signal?.throwIfAborted()

            // 1. Get the current batch of ready nodes from the frontier.
            const readyNodes = traverser.getReadyNodes()

            // 2. Execute the batch of nodes, respecting the concurrency limit.
            const settledResults = await executeBatch(
                readyNodes,
                traverser.getDynamicBlueprint(),
                state,
                executorFactory,
                services,
                concurrency,
            )

            // 3. Process the results to update state and determine the next frontier.
            await processResults(settledResults, traverser, state, services)
        }

        // Once the loop finishes, determine the final status and return the result.
        const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
        const result = state.toResult(serializer)
        result.status = status
        return result
    }
}
```

> [!TIP]
> [`executeBatch`](/api/orchestrators#executebatch) and [`processResults`](/api/orchestrators#processresults) are helper functions exported from `flowcraft/runtime` that handle node execution and result processing. These functions encapsulate the core orchestration logic, making it easy to build custom orchestrators without duplicating code.

---

### 2. `StepByStepOrchestrator`

This orchestrator executes only one "turn" of the workflow—a single batch of ready nodes. It's designed for debugging, interactive tools, or fine-grained testing where you want to inspect the state after each step.

#### Implementation

```typescript
import type { GraphTraverser, WorkflowState, IOrchestrator, NodeExecutorFactory, ExecutionServices, WorkflowResult } from 'flowcraft'
import { executeBatch, processResults } from 'flowcraft'

/**
 * An orchestrator that executes only one "tick" or "turn" of the workflow.
 * It processes a single batch of ready nodes from the frontier and then returns,
 * allowing the caller to inspect the intermediate state before proceeding.
 */
export class StepByStepOrchestrator implements IOrchestrator {
    public async run(
        traverser: GraphTraverser,
        executorFactory: NodeExecutorFactory,
        state: WorkflowState<any>,
        services: ExecutionServices,
    ): Promise<WorkflowResult<any>> {
        const { signal, concurrency, serializer } = services.options
        signal?.throwIfAborted()

        // Check if there is work to do. If the frontier is empty,
        // it means the workflow has stalled or completed in a previous step.
        if (!traverser.hasMoreWork()) {
            const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
            const result = state.toResult(serializer)
            result.status = status
            return result
        }

        // 1. Get the current batch of ready nodes. Unlike the run-to-completion
        //    orchestrator, this method does not loop.
        const readyNodes = traverser.getReadyNodes()

        // 2. Execute only this single batch.
        const settledResults = await executeBatch(
            readyNodes,
            traverser.getDynamicBlueprint(),
            state,
            executorFactory,
            services,
            concurrency,
        )

        // 3. Process the results to prepare the traverser for the *next* step.
        await processResults(settledResults, traverser, state, services)

        // 4. Return the result. The status will likely be 'stalled' until the
        //    final step, which is the expected behavior for this orchestrator.
        const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
        const result = state.toResult(serializer)
        result.status = status
        return result
    }
}
```

#### **Usage Example (in a test or debug tool)**

```typescript
import { FlowRuntime, GraphTraverser, WorkflowState, StepByStepOrchestrator } from 'flowcraft'

// --- Inside a test runner ---
const runtime = new FlowRuntime({ ... })
const blueprint = ...

const state = new WorkflowState({})
const traverser = new GraphTraverser(blueprint)
const orchestrator = new StepByStepOrchestrator()

// Step 1: Execute start nodes
let result = await orchestrator.run(traverser, executorFactory, state, services)
console.log('After Step 1 Context:', result.context)
expect(result.status).toBe('stalled')
expect(result.context.startNodeOutput).toBeDefined()

// Step 2: Execute the next set of nodes
result = await orchestrator.run(traverser, executorFactory, state, services)
console.log('After Step 2 Context:', result.context)

// ... continue stepping until completion
if (!traverser.hasMoreWork()) {
    expect(result.status).toBe('completed')
}
```

---

### 3. `EventDrivenOrchestrator`

This example shows the *logic* that would power a distributed adapter. It doesn't implement [`IOrchestrator`](/api/orchestrators#iorchestrator-interface) directly because it's not a self-contained loop. Instead, it provides a method (`handleJob`) that is triggered externally for each node.

#### Implementation

```typescript
import type { ICoordinationStore, NodeExecutor, WorkflowBlueprint } from 'flowcraft'

/**
 * Simulates the logic for an event-driven orchestrator, such as one used by
 * a distributed adapter (e.g., BullMQ, SQS). This is not a traditional
 * orchestrator with a loop but a handler for individual, event-triggered jobs.
 */
export class EventDrivenOrchestrator {
    constructor(
        private services: any, // Simplified ExecutionServices
        private coordinationStore: ICoordinationStore, // For distributed locking
    ) {}

    /**
     * This method would be called by a queue worker every time it receives a new job.
     * @param nodeId The ID of the node to execute.
     * @param blueprint The full workflow blueprint.
     * @param state A handle to the distributed workflow state (e.g., an async context).
     * @param runId The unique ID for this workflow execution.
     * @returns A list of successor node IDs that should be enqueued.
     */
    public async handleJob(
        nodeId: string,
        blueprint: WorkflowBlueprint,
        state: any, // Represents the WorkflowState/AsyncContext
        runId: string,
    ): Promise<{ nodesToEnqueue: string[] }> {
        const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
        if (!nodeDef) throw new Error(`Node ${nodeId} not found`)

        // 1. Get the executor for this specific node.
        const executor: NodeExecutor<any, any> = this.services.executorFactory(blueprint)(nodeId)
        const input = await this.services.resolveNodeInput(nodeId, blueprint, state.getContext())

        // 2. Execute the single node.
        const executionResult = await executor.execute(input)

        if (executionResult.status !== 'success') {
            // In a real system, you would publish a failure event or write to a dead-letter queue.
            console.error(`Node ${nodeId} failed for run ${runId}`, executionResult.error)
            return { nodesToEnqueue: [] }
        }

        const result = executionResult.result
        await state.addCompletedNode(nodeId, result.output)

        // 3. Determine the direct successors based on the result.
        const nextNodes = await this.services.determineNextNodes(blueprint, nodeId, result, state.getContext())

        const nodesToEnqueue: string[] = []
        for (const { node: nextNodeDef, edge } of nextNodes) {
            // 4. Apply data transformation for the edge.
            await this.services.applyEdgeTransform(edge, result, nextNodeDef, state.getContext())

            // 5. CRITICAL: Check if the successor is ready to run (handles fan-in joins).
            // This check MUST be atomic in a distributed environment.
            const isReady = await this.isReadyForFanIn(runId, blueprint, nextNodeDef.id)
            if (isReady) {
                nodesToEnqueue.push(nextNodeDef.id)
            }
        }

        console.log(`[RunID: ${runId}] Node ${nodeId} finished. Enqueuing:`, nodesToEnqueue)
        return { nodesToEnqueue }
    }

    /**
     * Encapsulates the fan-in join logic using a distributed coordination store (e.g., Redis).
     */
    private async isReadyForFanIn(runId: string, blueprint: WorkflowBlueprint, targetNodeId: string): Promise<boolean> {
        const targetNode = blueprint.nodes.find((n) => n.id === targetNodeId)
        const joinStrategy = targetNode?.config?.joinStrategy || 'all'
        const predecessors = blueprint.edges.filter((e) => e.target === targetNodeId)

        if (predecessors.length <= 1) {
            return true // No fan-in, always ready.
        }

        if (joinStrategy === 'any') {
            // Attempt to acquire a lock. The first predecessor to arrive wins.
            const lockKey = `flowcraft:joinlock:${runId}:${targetNodeId}`
            return this.coordinationStore.setIfNotExist(lockKey, 'locked', 3600)
        } else { // 'all' strategy
            // Atomically increment a counter. If the count matches the number
            // of predecessors, the node is ready.
            const fanInKey = `flowcraft:fanin:${runId}:${targetNodeId}`
            const readyCount = await this.coordinationStore.increment(fanInKey, 3600)
            return readyCount >= predecessors.length
        }
    }
}
```

---

### 4. `ResumptionOrchestrator`

This orchestrator is a great example of composition. It doesn't re-implement the execution loop. Instead, it performs a "reconciliation" step to prepare the `GraphTraverser` and then delegates the actual execution to another orchestrator (like `RunToCompletionOrchestrator`).

#### Implementation

```typescript
import type { ExecutionServices, GraphTraverser, IOrchestrator, NodeExecutorFactory, WorkflowBlueprint, WorkflowResult } from 'flowcraft'
import { RunToCompletionOrchestrator, WorkflowState } from 'flowcraft'

/**
 * An orchestrator designed to resume a previously stalled workflow. It first
 * reconciles the saved state to determine the correct starting frontier and then
 * delegates the rest of the execution to another orchestrator (e.g., RunToCompletion).
 */
export class ResumptionOrchestrator implements IOrchestrator {
    private readonly subsequentOrchestrator: IOrchestrator

    constructor(subsequentOrchestrator?: IOrchestrator) {
        // By default, it will continue with the standard run-to-completion logic.
        this.subsequentOrchestrator = subsequentOrchestrator || new RunToCompletionOrchestrator()
    }

    public async run(
        traverser: GraphTraverser,
        executorFactory: NodeExecutorFactory,
        state: WorkflowState<any>,
        services: ExecutionServices,
    ): Promise<WorkflowResult<any>> {
        const blueprint = traverser.getDynamicBlueprint()

        // 1. RECONCILIATION PHASE
        console.log('Resuming workflow. Reconciling state...')
        const completedNodes = state.getCompletedNodes()
        const newFrontier = this.calculateResumedFrontier(blueprint, completedNodes)

        // 2. Update the traverser with the newly calculated frontier.
        // (This assumes a method on GraphTraverser to reset its state)
        traverser.setFrontier(newFrontier)
        traverser.setCompletedNodes(completedNodes) // Also sync completed nodes

        console.log('Reconciliation complete. New frontier:', newFrontier)

        // 3. DELEGATION PHASE
        // Now that the traverser is in the correct state, delegate to the
        // standard orchestrator to run the rest of the workflow.
        return this.subsequentOrchestrator.run(
            traverser,
            executorFactory,
            state,
            services,
        )
    }

    /**
     * Determines the set of nodes that are ready to run based on which nodes
     * have already been completed.
     */
    private calculateResumedFrontier(blueprint: WorkflowBlueprint, completedNodes: Set<string>): Set<string> {
        const newFrontier = new Set<string>()
        const allNodeIds = new Set(blueprint.nodes.map(n => n.id))

        for (const nodeId of allNodeIds) {
            // Skip nodes that are already done.
            if (completedNodes.has(nodeId)) {
                continue
            }

            const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
            const predecessors = new Set(blueprint.edges.filter(e => e.target === nodeId).map(e => e.source))

            // A start node that hasn't run is part of the frontier.
            if (predecessors.size === 0) {
                newFrontier.add(nodeId)
                continue
            }

            const joinStrategy = nodeDef?.config?.joinStrategy || 'all'
            const completedPredecessors = [...predecessors].filter(p => completedNodes.has(p))

            const isReady =
                (joinStrategy === 'any' && completedPredecessors.length > 0) ||
                (joinStrategy === 'all' && completedPredecessors.length === predecessors.size)

            if (isReady) {
                newFrontier.add(nodeId)
            }
        }
        return newFrontier
    }
}
```
