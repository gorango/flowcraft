### 1. State Persistence & Resumability (The "Snapshot" Feature)

This is the most significant and valuable feature that Flowcraft could benefit from.

`withSnapshot` Higher-Order-Function that wraps a workflow, allowing its state (event queue, pending promises) to be captured and resumed later.

**Why it's valuable:**
*   **Long-Running Workflows:** Enables workflows that last for hours or days (e.g., waiting for human approval).
*   **Fault Tolerance:** If the process crashes, you can resume from the last known good state instead of restarting.
*   **Interactive Agents:** Crucial for "human-in-the-loop" scenarios where the workflow must pause to wait for user input, then continue with the full context intact.

**How to adapt it for Flowcraft:**

Flowcraft's state is simpler and more structured, which actually makes this *easier* to implement. A snapshot in Flowcraft consists of two key pieces of information:
1.  **The current `Context` object.**
2.  **The ID of the next `Node` to be executed.**

Here's a potential implementation strategy:

**A. Introduce a `PersistentExecutor`:**

Create a new executor, `PersistentExecutor`, that takes a storage adapter (e.g., for Redis, a database, or even the file system).

```typescript
interface IStorageAdapter {
  saveState(workflowId: string, state: SnapshotState): Promise<void>;
  loadState(workflowId: string): Promise<SnapshotState | null>;
}

interface SnapshotState {
  context: Record<string, any>; // Serialized context
  nextNodeId: string;
  originalGraph: WorkflowGraph; // To rebuild the flow
}

class PersistentExecutor extends InMemoryExecutor {
  constructor(private storage: IStorageAdapter, private builder: GraphBuilder<any, any>) {
    super();
  }

  // Override the core orchestration to save state after each node
  async _orch(...) {
    // ... existing loop ...
    while (currentNode) {
      // ... run the node ...
      action = await chain(nodeArgs);

      // After a node successfully runs, save the state
      const nextNode = this.getNextNode(currentNode, action);
      if (nextNode) {
        await this.storage.saveState(runId, {
          context: serializeContext(context), // would need a serialization util
          nextNodeId: nextNode.id,
        });
      }
      currentNode = nextNode;
    }
    // ...
  }

  async resume(workflowId: string): Promise<any> {
    const state = await this.storage.loadState(workflowId);
    if (!state) {
      throw new Error(`No saved state found for workflow ${workflowId}`);
    }

    // Rebuild the flow from the saved graph definition
    const { flow, nodeMap } = this.builder.build(state.originalGraph);
    const context = deserializeContext(state.context);
    const startNode = nodeMap.get(state.nextNodeId);

    if (!startNode) {
      throw new Error(`Node ${state.nextNodeId} not found in graph.`);
    }

    // Run the orchestration starting from the resumed node
    return this._orch(startNode, flow.middleware, context, internalOptions);
  }
}
```

This approach integrates persistence directly into the execution loop, making it a powerful, built-in feature for mission-critical workflows.

---

### 2. Enhanced Streaming & Reactivity

**Concept from W-TS:** The `WorkflowStream`, which makes it trivial to stream events over HTTP (`toResponse`) or convert to an `Observable`.

**Why it's valuable:**
*   Provides real-time visibility into a running workflow for UIs or logging systems.
*   Allows clients to react to intermediate results without waiting for the entire workflow to finish.

**How to adapt it for Flowcraft:**

The `Executor` is the perfect place to generate a stream of execution events.

**A. Modify the `Executor.run` method:**

Instead of just returning the final result, `run` could return an object containing the result and a stream.

```typescript
// in IExecutor
run<T>(...): Promise<{ finalResult: T, events: ReadableStream<WorkflowExecutionEvent> }>;

// in InMemoryExecutor._orch
public async _orch(...) {
    const streamController = new AbortController();
    const eventStream = new ReadableStream<WorkflowExecutionEvent>({
        start(controller) {
            // ...
        }
    });

    // Inside the loop
    while (currentNode) {
        // Enqueue an event BEFORE running the node
        controller.enqueue({ type: 'NodeExecutionStart', nodeId: currentNode.id, timestamp: Date.now() });

        // ... run the node ...
        action = await chain(nodeArgs);

        // Enqueue an event AFTER the node runs
        controller.enqueue({ type: 'NodeExecutionSuccess', nodeId: currentNode.id, action, timestamp: Date.now() });
    }
    controller.close();
    // ...
}
```

**B. Introduce a `FlowcraftStream` wrapper:**

Could create our own stream wrapper class to provide a rich API, similar to `WorkflowStream`.

```typescript
class FlowcraftStream extends ReadableStream<WorkflowExecutionEvent> {
  // ... constructor ...

  toResponse(init?: ResponseInit): Response {
    // Logic to pipe the stream of JSON events into a Response body
  }

  filterByNodeType(type: string): FlowcraftStream {
    // Filter events based on node type
  }

  onNodeSuccess(nodeId: string, callback: (event: NodeSuccessEvent) => void): () => void {
    // Type-safe event subscription
  }
}
```

This would give Flowcraft users first-class support for real-time observability and reactive integrations.

---

### 3. Event-Driven Workflow Triggers

**Concept from W-TS:** The entire system is event-driven. A workflow doesn't "run" from start to finish in the same way; it *reacts* to events sent via `sendEvent`.

**Why it's valuable:**
*   Decouples the trigger of a workflow from the workflow itself.
*   Excellent for integrating with message queues (Kafka, RabbitMQ), webhooks, or other asynchronous event sources.

**How to adapt it for Flowcraft:**

Add an event-driven layer *on top of* Flowcraft's graph execution model without changing the core.

**A. Create a `WorkflowRegistry` or `Daemon`:**

This would be a long-lived service that holds graph definitions and listens for trigger events.

```typescript
// Define a simple event structure
type TriggerEvent = { name: string; payload: any };

class WorkflowDaemon {
  private registry = new Map<string, { graph: WorkflowGraph, builder: GraphBuilder<any,any> }>();

  register(triggerName: string, graph: WorkflowGraph, builder: GraphBuilder<any,any>) {
    this.registry.set(triggerName, { graph, builder });
  }

  // This would be called by the application's event loop/listener
  async trigger(event: TriggerEvent) {
    if (this.registry.has(event.name)) {
      const { graph, builder } = this.registry.get(event.name)!;
      const { flow } = builder.build(graph);

      // Initialize context with the event payload
      const PAYLOAD_KEY = contextKey<any>('event_payload');
      const ctx = new TypedContext([[PAYLOAD_KEY, event.payload]]);

      // Run the workflow as a fire-and-forget task
      // Could add logging, error handling, etc. here
      new InMemoryExecutor().run(flow, ctx);
    }
  }
}
```

This pattern preserves the structured execution of Flowcraft's graphs while allowing them to be invoked in a more flexible, decoupled, and event-driven manner.

---

*   **Highest Impact:** Implementing **State Persistence & Resumability** would open up Flowcraft to a whole new class of long-running and interactive use cases.
*   **Most Complementary:** Adding **Enhanced Streaming** would be a natural extension of the `Executor`, providing immense value for observability without altering the core workflow logic.
*   **Biggest Paradigm Shift:** Introducing **Event-Driven Triggers** would add a powerful new way to integrate Flowcraft into larger, event-based systems.
