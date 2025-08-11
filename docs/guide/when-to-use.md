# When to Use Flowcraft

Flowcraft is a versatile framework, but like any tool, it excels at solving a particular class of problems. This guide will help you understand its ideal use cases and how it compares to other tools in the ecosystem.

## Ideal Use Cases

Flowcraft is an excellent choice for:

### AI Agent Orchestration

Modeling the "reasoning loop" of an AI agent is a natural fit for a graph. Conditional branching, tool use, parallel thought processes, and error handling are all easily and explicitly implemented. The declarative graph engine is particularly powerful for building dynamic runtimes where the agent's behavior is defined as data, not code.

- **See it in action**: The **[Advanced RAG Agent](https://github.com/gorango/flowcraft/tree/master/sandbox/6.rag/)** is a complete, end-to-end example of this pattern.

### Data Processing & ETL Pipelines

Flowcraft is perfect for defining and executing Extract, Transform, Load (ETL) pipelines. Its support for parallel batch processing makes it highly efficient for I/O-bound tasks.

- **See it in action**: The [Parallel Batch Translation](https://github.com/gorango/flowcraft/tree/master/sandbox/3.parallel/) sandbox is a great example of this.

### Complex Business Logic

Any multi-step business process with conditional paths, retries, and fallbacks can be modeled as a workflow. This makes the logic explicit, testable, and easier to maintain than a deeply nested set of `if/else` statements and `try/catch` blocks.

- **Examples**: User onboarding sequences, e-commerce order fulfillment, report generation.

### Multi-Step Background Jobs

Flowcraft can be the engine for running tasks in the background of a web application. The ability to create a custom distributed executor allows you to offload these jobs to a dedicated fleet of workers.

- **See it in action**: The [Distributed Executor](https://github.com/gorango/flowcraft/tree/master/sandbox/5.distributed/) sandbox showcases running workflows via a BullMQ job queue.

## How Flowcraft Compares

### vs. Plain `async/await`

- **Use `async/await` for:** Simple, linear sequences of a few asynchronous calls. If your logic is a straight line, you don't need a framework.
- **Use Flowcraft when:** Your process starts to look like a state machine or a graph. If you need retries, fallbacks, conditional branching, parallel execution, or if the process is long-running, Flowcraft provides the structure to manage that complexity.

### vs. LangChain / LlamaIndex

- **Use LangChain/LlamaIndex for:** Rapid prototyping with a vast ecosystem of pre-built integrations for LLMs, vector stores, and data loaders. They are excellent for getting started quickly.
- **Use Flowcraft when:** You want an unopinionated, lightweight **runtime** for your custom AI logic. Flowcraft gives you full control over your prompts, business logic, and execution flow, without imposing a specific data structure (like "Chains" or "Documents"). You bring your own logic; Flowcraft provides the engine to run it reliably.

### vs. Temporal / Airflow

- **Use Temporal/Airflow when:** You need **durability** and **guaranteed execution** out of the box. These are heavy-duty, production-grade platforms designed to ensure workflows can survive server crashes and resume automatically. They come with more operational overhead.
- **Use Flowcraft when:** You want to start with a lightweight, in-process library and have the *option* to build a distributed system later. Flowcraft provides the architectural patterns (like a pluggable executor and serializable blueprints) to build a durable system on top of a message queue like BullMQ or RabbitMQ, but it does not provide the infrastructure itself.
