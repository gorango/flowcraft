# Examples Index

This page provides an overview of all Flowcraft examples, including summaries and visualizations of each workflow.

## Basic Workflow

A basic, linear workflow that creates a greeting message. It demonstrates defining a workflow with `createFlow`, passing data between nodes, and executing with `FlowRuntime`.

```mermaid
flowchart TD
	A["fetch-user"] --> B["extract-name"]
	B --> C["create-greeting"]
```

## Parallel Batch Translation

Demonstrates using Flowcraft's `.batch()` helper to translate a document into multiple languages concurrently, showcasing performance improvements for I/O-bound tasks.

```mermaid
graph TD
    A[Prepare Jobs] --> B{Batch Translation};
    B --> C[Save Results];
```

## Research Agent

A simple research agent that searches the web and answers questions using conditional branching and loops.

```mermaid
graph TD
    A[DecideAction] -->|"search"| B[SearchWeb]
    A -->|"answer"| C[AnswerQuestion]
    B -->|"decide"| A
```

## Advanced RAG Agent with Document Analysis

A sophisticated RAG agent that ingests documents, generates embeddings, performs vector searches, and synthesizes answers.

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

## Dynamic AI Agent from Visual Graphs

A runtime engine for executing graph-based AI workflows defined as JSON files, with support for parallelism, branching, and nested workflows.

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

## Distributed AI Agent with a Pluggable Executor

Runs the DAG example in a distributed environment using BullMQ, with client-worker separation and awaitable workflows.
