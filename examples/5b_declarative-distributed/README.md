# Declarative AI Agent - Distributed Execution with BullMQ

This example demonstrates the power of Flowcraft's adapter pattern by running the same complex AI agent from the shared logic package in a **distributed environment** using the `BullMQAdapter`.

It showcases a client-worker architecture where a client can initiate a workflow and asynchronously wait for its final result. Each node's execution is a job processed by one or more separate worker processes—a common pattern for building scalable and resilient automation systems.

## Features

- **Distributed Execution**: Uses Redis and BullMQ to manage workflow execution across separate processes.
- **Client-Worker Architecture**:
  - The **Client** (`src/client.ts`) is a lightweight process that starts the workflow and awaits the final result.
  - The **Worker** (`src/worker.ts`) is a separate process that executes the actual node logic.
- **Reuses Business Logic**: Executes the exact same workflow definitions from the `@flowcraft/example-declarative-shared-logic` package without any changes, showcasing the power of abstracting the execution layer.
- **Resilience & Scalability**: By using a message queue, workflows can survive process restarts. You can run multiple worker processes to handle a high volume of concurrent tasks.

## How to Run

1.  **Start a Redis Server**: This example requires a running Redis instance. The easiest way is with Docker:

    ```bash
    docker run --name some-redis -d -p 6379:6379 redis
    ```

2.  **Install dependencies**:
    From the root of the `flowcraft` project, run:
    ```bash
    npm install
    ```

3.  **Set your OpenAI API key**:
    Create a `.env` file in this project's root directory (`examples/5b_declarative-distributed/`):

    ```
    OPENAI_API_KEY="your-api-key-here"
    ```

4.  **Run the Worker**: Open a terminal and start the worker process. It will connect to Redis and wait for jobs.

    ```bash
    npm run worker
    ```

5.  **Run the Client**: Open a **second terminal** and run the client. This will kick off the workflow and log a `Run ID`.

    ```bash
    npm start
    ```
    You can change the active use-case in `src/client.ts`.

## How It Works

This example leverages the `BullMQAdapter` to decouple workflow orchestration from a single process.

1.  **Shared Logic**: Both the client and the worker import the `blueprints`, `agentNodeRegistry`, and `config` from the `@flowcraft/example-declarative-shared-logic` package.
2.  **Client (`client.ts`)**:
    - Generates a unique `runId`.
    - Determines the starting node(s) for the selected workflow.
    - Creates the initial context in Redis and enqueues the first job(s) into the BullMQ queue.
    - Enters a polling loop to await the final result on a specific Redis key.
3.  **Worker (`worker.ts`)**:
    - Initializes the `BullMQAdapter`, providing it the `blueprints` and `agentNodeRegistry` from the shared package.
    - The adapter listens for jobs from the queue.
    - When a job is received, the adapter uses the internal `FlowRuntime` to execute the corresponding node.
    - The adapter handles all the complex orchestration logic: determining the next nodes, managing fan-in/fan-out joins with Redis, and enqueuing subsequent jobs.
    - When the workflow completes or fails, the adapter publishes the final result back to Redis for the client.

For a detailed breakdown of the available use-cases and their workflow graphs, see the **[Shared Logic README](../5_declarative-shared-logic/README.md)**.
