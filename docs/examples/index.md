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
    subgraph "Advanced RAG Agent"
        A[Load & Chunk Document] --> B[Generate Embeddings in Parallel]
        B --> C[Store in Vector DB]
        C --> D[Vector Search for Question]
        D --> E[Generate Final Answer]
    end
```

## Dynamic AI Agent from Visual Graphs

A runtime engine for executing graph-based AI workflows defined as JSON files, with support for parallelism, branching, and nested workflows.

```mermaid
graph TD
    subgraph "Blog Post Generation (ID: 100)"
        A[generate_outline] --> B[draft_post]
        B --> C[suggest_titles]
        C --> D[final_output]
    end
```

## Distributed AI Agent with a Pluggable Executor

Runs the DAG example in a distributed environment using BullMQ, with client-worker separation and awaitable workflows.
