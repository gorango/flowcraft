# Philosophy & Comparison

This guide explains the core design principles behind Cascade and compares it to other common tools and patterns. Its goal is to help you understand not only *what* Cascade does, but *why* you might choose it for your project.

## Core Philosophy

Cascade is designed as a lightweight, unopinionated, and extensible **toolkit**, not a monolithic platform. Its philosophy is built on a few key principles:

1. **Structure for Complexity**: At its heart, Cascade provides a clear, structured way to model complex asynchronous processes. By breaking logic into discrete `Node`s with a defined lifecycle (`prep`, `exec`, `post`), you can turn tangled promise chains and `async/await` blocks into maintainable, testable, and reusable graphs.

2. **Start Simple, Scale Gracefully**: You can start with a simple, in-memory workflow in a single file. As your needs grow, the `IExecutor` pattern allows you to scale up to a robust, distributed system using message queues—**without changing your core business logic**. This avoids the high initial overhead of heavy, distributed-first platforms.

3. **Composability is Key**: A `Flow` is just a specialized `Node`. This simple but powerful concept means entire workflows can be treated as building blocks. This allows you to create highly modular systems, encapsulating complex logic into reusable sub-flows that can be tested in isolation and composed into larger processes.

4. **Be Unopinionated**: Cascade provides the runtime and the patterns, but it doesn't dictate *how* you write your business logic. It has no specific opinions on how you should format your LLM prompts, connect to your database, or validate your data. It's a general-purpose engine designed to orchestrate *your* code.

## When to Use Cascade

Cascade is an excellent choice for a variety of scenarios:

- **AI Agent Orchestration**: Its primary strength. Modeling the "reasoning loop" of an AI agent is a natural fit for a graph. Conditional branching (`llm-router`), tool use (a `Node` that calls an API), and parallel thought processes (fan-out) are easily implemented.
- **Data Processing & ETL Pipelines**: Workflows that fetch data from a source, run a series of transformations and enrichments, and save it to a destination are a perfect use case. `BatchFlow` and `ParallelBatchFlow` are designed specifically for this.
- **Complex Business Logic**: Any multi-step process with conditional paths, retries, and fallbacks. Examples include user onboarding sequences, e-commerce order fulfillment, or content moderation pipelines.
- **Multi-Step Background Jobs**: For tasks in a web application that need to run after a request is complete, like generating a report, sending a series of emails, or processing an uploaded file.

## When *Not* to Use Cascade

No tool is perfect for every job. You might not need Cascade if:

- **Your task is a simple, linear `async` sequence**. If you just need to `await` two or three functions in a row with minimal error handling, standard `async/await` is cleaner and sufficient.
- **You need a fully-managed, durable, at-scale workflow platform out of the box**. For mission-critical, long-running workflows that must survive deployments and guarantee execution, platforms like **Temporal**, **AWS Step Functions**, or **Airflow** are more appropriate. They are feature-rich services/platforms, whereas Cascade is a library that provides the *pattern* to build such a system.

## Comparison to Other Tools

### vs. Plain `async/await` and Promise Chaining

- **The Alternative**: Standard JavaScript for handling asynchronous operations.
- **Use `async/await` when**: Your logic is simple, mostly linear, and doesn't require features like automatic retries, fallbacks, middleware, or complex conditional paths.
- **Use Cascade when**: Your process starts to look like a state machine or a graph. If you find yourself writing complex `try/catch` blocks with retry loops, or intricate `if/else` or `switch` statements to manage the flow, Cascade will provide a much cleaner and more maintainable structure.

### vs. LangChain / LlamaIndex

- **The Alternatives**: High-level, "batteries-included" frameworks specifically for building LLM-powered applications. They provide many pre-built abstractions for prompts, chains, agents, and tool integrations.
- **Use LangChain/LlamaIndex when**: You want to prototype quickly and benefit from their vast ecosystem of integrations and high-level agent types (e.g., ReAct, Self-Ask). You are comfortable adopting their specific abstractions (like LCEL).
- **Use Cascade when**: You want an unopinionated **runtime** for your AI logic. If you prefer to have full control over your prompts and business logic and just need a robust engine to orchestrate the steps, Cascade is a better fit. It acts as the structured, scalable backbone for your custom AI logic, rather than providing the AI abstractions themselves.

### vs. Temporal / Airflow / AWS Step Functions

- **The Alternatives**: Heavy-duty, distributed-first workflow orchestration platforms designed for high-reliability, long-running, and scheduled tasks.
- **Use Temporal/Airflow when**: Your primary need is **durability**. These systems persist the state of your workflow and can resume it after server crashes or deployments. They are platforms you deploy and manage, complete with UIs, schedulers, and strong execution guarantees.
- **Use Cascade when**: You want to start with an in-process library and have the *option* to scale. Cascade is a great fit for adding robust, graph-based logic *within a single service or monolith*. The `BullMQ` example shows it can power a distributed system, but you are responsible for the message queue and worker infrastructure. Cascade provides the toolkit; Temporal provides the entire factory.
