# Examples Index

[[view source code]](https://github.com/gorango/flowcraft/tree/master/examples)

This page provides an overview of all Flowcraft examples, including summaries and visualizations of each workflow.

You can clone the [Flowcraft repository](https://github.com/gorango/flowcraft/tree/master/examples) to run them all locally.

## [Basic Workflow](/examples/basic)

A basic, linear workflow that creates a greeting message. It demonstrates defining a workflow with [`createFlow`](/api/flow#createflow-id), passing data between nodes, and executing with [`FlowRuntime`](/api/runtime#flowruntime-class).

```mermaid
flowchart TD
	A["fetch-user"] --> B["extract-name"]
	B --> C["create-greeting"]
```

## [Parallel Batch Translation](/examples/translate)

Demonstrates using Flowcraft's [`.batch()`](/api/flow#batch-tinput-toutput-taction-id-worker-options) helper to translate a document into multiple languages concurrently, showcasing performance improvements for I/O-bound tasks.

```mermaid
graph TD
    A[Prepare Jobs] --> B{Batch Translation};
    B --> C[Save Results];
```

## [Research Agent](/examples/research)

A simple research agent that searches the web and answers questions using conditional branching and [loops](/guide/loops).

```mermaid
graph TD
    A[DecideAction] -->|"search"| B[SearchWeb]
    A -->|"answer"| C[AnswerQuestion]
    B -->|"decide"| A
```

## [Dynamic AI Workflows from JSON Files](/examples/declarative)

An in-memory runtime engine for executing [declarative workflows](/guide/declarative) defined as JSON files, with support for parallelism, branching, and [subflows](/guide/subflows).

```mermaid
graph TD
    subgraph "Workflow Definition"
        Blueprint["JSON Blueprint <br><small>(e.g., 200.json)</small>"]
    end

    subgraph "Execution Logic"
        Runtime("FlowRuntime")
        Registry["Node Registry"]
        Functions["Node Functions"]
    end

    Main("Entry")

    Main -- "1. Loads" --> Blueprint
    Main -- "2. Creates & Configures" --> Runtime

    Runtime -- "Reads graph from" --> Blueprint
    Runtime -- "Uses" --> Registry

    Registry -- "Maps string types to" --> Functions
```

## [Distributed Dynamic Workflows](/examples/distributed)

Implements the previous example, but in a distributed environment using [BullMQ](/guide/adapters/bullmq), with client-worker separation and awaitable workflows.

```mermaid
graph TD
    subgraph "Client Application"
        Client("Client")
    end

    subgraph "Redis"
        direction LR
        Queue[("BullMQ Queue")]
        State[("State Store")]
    end

    subgraph "Worker Service(s)"
        Worker("Worker")
    end

    Client -- "1. Enqueues Start Job" --> Queue
    Client -- "2. Writes Initial Context" --> State

    Worker -- "3. Dequeues Job" --> Queue
    Worker -- "4. Reads/Writes Workflow State" --> State
    Worker -- "5. Enqueues Next Job(s)" --> Queue

    State -- "6. Final result is written" --> Worker
    State -- "7. Client reads final result" --> Client
```

## [RAG Workflow for Document Analysis](/examples/rag)

A sophisticated RAG agent that implements a custom [serializer](/guide/serializers), ingests documents, generates embeddings, performs vector searches, and synthesizes answers.

```mermaid
graph TD
	A[Load & Chunk Document] --> B[Generate Embeddings]
	subgraph "Parallel Process"
		B --> B1[0]
		B --> B2[1]
		B --> B3[2]
		B --> B4[n]
	end
	B1 & B2 & B3 & B4 --> C[Store in Vector DB]
	C --> D[Vector Search for Question]
	D --> E[Generate Final Answer]
```
