# Distributed AI Agent with a Pluggable Executor

This example demonstrates the power of the `Executor` pattern by running the same complex, graph-based AI agent from the DAG example in a distributed environment using **BullMQ**.

It showcases a client-worker architecture where a client can initiate a workflow, and the actual execution of each node happens as a job processed by one or more separate worker processes. This is a common pattern for building scalable, resilient, and long-running process automation systems.

## Features

- **Pluggable `BullMQExecutor`**: A custom executor that, instead of running nodes in-memory, enqueues them as jobs in a Redis-backed BullMQ queue.
- **Client-Worker Separation**:
  - The **Client** (`src/client.ts`) is a lightweight process that builds the initial context and starts a workflow. This is a non-blocking, "fire-and-forget" operation.
  - The **Worker** (`src/worker.ts`) is a separate, long-running process that listens for jobs, executes the logic for a single node, and enqueues the next node(s) in the graph.
- **State Serialization**: The `Context` is serialized to a plain object and passed between jobs, allowing state to flow through the distributed graph.
- **Distributed Cancellation**: A `runId` is generated for each workflow. You can gracefully abort a running workflow by pressing 'c' in the worker terminal and providing the corresponding `runId`, demonstrating how to manage distributed processes.
- **Resilience & Scalability**: By using a message queue, workflows can survive process restarts. You can run multiple worker processes to handle a high volume of concurrent workflows.
- **Unchanged Business Logic**: The exact same declarative JSON graph definitions from the DAG example are used here. The change in execution environment (in-memory vs. distributed) is completely transparent to the workflow's definition.

## How to Run

1. **Start a Redis Server**: This example requires a running Redis instance for BullMQ. The easiest way is with Docker:

    ```bash
    docker run --name some-redis -d -p 6379:6379 redis
    ```

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Set your OpenAI API key**:
    Create a `.env` file in this project's root directory:

    ```
    OPENAI_API_KEY="your-api-key-here"
    ```

4. **Run the Worker**: Open a terminal and start the worker process. It will connect to Redis and wait for jobs.

    ```bash
    npm run worker
    ```

5. **Run the Client**: Open a **second terminal** and run the client. This will kick off the workflow and log a `Run ID` to the console.

    ```bash
    npm start
    ```

    You can change the active use-case in `src/client.ts`.

    The client will log a `Run ID` like this:

    ```
    =============================================================
    🚀 Starting Workflow Run ID: ab12
    =============================================================
    ```

    Keep this `Run ID` handy.

6. **(Optional) Cancel the Workflow**:
    - Switch back to the **worker terminal**.
    - Press the `c` key.
    - At the prompt, enter the `Run ID` from the client and press Enter.
    - The worker will signal for cancellation, and any subsequent jobs for that `Run ID` will be aborted.

## How It Works

1. **Client (`client.ts`)**:
    - Generates a unique `runId` for the new workflow execution.
    - Initializes the `WorkflowRegistry` and gets the desired `Flow` definition.
    - Creates an instance of `BullMQExecutor`, pointing to the job queue.
    - Calls `flow.run()` with the custom executor and the `runId`. The executor identifies the starting node(s) of the graph, serializes the initial context, and adds the first job(s) to the BullMQ queue. It then exits.

2. **Worker (`worker.ts`)**:
    - Connects to the same BullMQ queue.
    - The worker's processor function receives a job containing `{ runId, workflowId, nodeId, context }`.
    - **Cancellation Check**: Before doing any work, it checks if a cancellation key (e.g., `workflow:cancel:<runId>`) exists in Redis. If so, it aborts the job.
    - It uses the `WorkflowRegistry` to find the executable `Node` instance corresponding to the `nodeId`.
    - It deserializes the `context` and executes the node's logic (`node._run()`).
    - After execution, it determines the successor node(s) based on the action returned by the node.
    - For each successor, it enqueues a **new job**, passing along the now-updated `context` and the original `runId`.
    - This process repeats until a branch of the workflow completes or is cancelled.
