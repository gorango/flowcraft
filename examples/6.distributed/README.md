# Distributed AI Agent with a Pluggable Executor

This example demonstrates the power of the `Executor` pattern by running the same complex, graph-based AI agent from the DAG example in a distributed environment using **BullMQ**.

It showcases a client-worker architecture where a client can initiate a workflow and **asynchronously wait for its final result**. The actual execution of each node happens as a job processed by one or more separate worker processes, which is a common pattern for building scalable, resilient, and long-running process automation systems.

## Features

- **Awaitable Workflows**: The client can start a workflow and wait for a definitive `completed`, `failed`, or `cancelled` status, making it easy to integrate into request-response patterns like an API server.
- **Pluggable `BullMQExecutor`**: A custom executor that, instead of running nodes in-memory, enqueues them as jobs in a Redis-backed BullMQ queue.
- **Client-Worker Separation**:
  - The **Client** (`src/client.ts`) is a lightweight process that initiates the workflow and then polls a Redis key for the final status.
  - The **Worker** (`src/worker.ts`) is a separate, long-running process that listens for jobs, executes the logic for a single node, and reports the final status back to the client via Redis.
- **State Serialization**: The `Context` is serialized to a plain object and passed between jobs, allowing state to flow through the distributed graph.
- **Distributed Cancellation**: A `runId` is generated for each workflow. You can gracefully abort a running workflow by pressing 'c' in the worker terminal and providing the corresponding `runId`, and the client will be notified of the cancellation.
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

5. **Run the Client**: Open a **second terminal** and run the client. This will kick off the workflow, log a `Run ID`, and wait for the final result.

    ```bash
    npm start
    ```

    You can change the active use-case in `src/client.ts`.

    The client will log a `Run ID` like this:

    ```
    🚀 Starting Workflow and awaiting result...
    [INFO] [Executor] Enqueuing 1 start node(s) for workflow 123
    [INFO] [Executor] Starting Run ID: a1
    ```

    Keep this `Run ID` handy.

6. **(Optional) Cancel the Workflow**:
    - While the client is waiting, switch to the **worker terminal**.
    - Press the `c` key.
    - At the prompt, enter the `Run ID` from the client and press Enter.
    - The worker will signal for cancellation, and the client in the other terminal will immediately report that the workflow was cancelled.

## How It Works

This example uses a client-worker architecture with Redis acting as a communication bus.

1. **Client (`client.ts`)**:
    - The client's role is to **initiate** the workflow and **await its completion**.
    - It generates a unique `runId`.
    - It uses the `BullMQExecutor` to add the first job(s) to the BullMQ queue.
    - It then enters a polling loop (`waitForWorkflow`), checking a specific Redis key (`workflow:status:<runId>`) for a final status.

2. **Worker Process (`worker.ts`)**:
    - The worker is the **long-running orchestrator** of the distributed system.
    - It processes jobs from the queue one by one.
    - After executing a node, it checks if it was the final node in a branch (marked by a special `FINAL_ACTION`).
    - **Status Reporting**: If the node was final, failed, or was cancelled, the worker writes a status object (e.g., `{ "status": "completed", "payload": ... }`) to the Redis status key that the client is polling.
    - **Cancellation**: The worker also polls Redis for a cancellation signal for the current `runId` and will gracefully abort execution if the signal is found.
    - If the workflow is not finished, the worker enqueues the next node(s) in the graph, continuing the process.

This architecture decouples the client from the execution, allowing the system to be resilient and scalable while still providing a simple, awaitable interface for the initiating process.
