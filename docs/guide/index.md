# What is Flowcraft?

Flowcraft is a lightweight, zero-dependency TypeScript framework for building complex, multi-step processes. It empowers you to model everything from simple sequential tasks to dynamic, graph-driven AI agents with a clear and composable API.

At its core, Flowcraft is guided by a few key principles:

1.  **Structure for Complexity**: It provides a clear way to model asynchronous processes. By breaking logic into discrete `Node`s with a defined lifecycle, you can turn tangled promise chains and `async/await` blocks into maintainable, testable graphs.
2.  **Start Simple, Scale Gracefully**: You can start with an in-memory workflow in a single file. As your needs grow, the architecture allows you to scale up to a robust, distributed system using message queues—**without changing your core business logic**.
3.  **Composability is Key**: A `Flow` is just a specialized `Node`. This simple but powerful concept means entire workflows can be treated as building blocks, allowing you to create highly modular and reusable systems.

## The Two Paths of Flowcraft

Flowcraft is designed to cater to two primary use cases, and the documentation is structured to guide you down the path that best fits your needs:

### 1. Programmatic Workflows

This is the path for developers who want to build and manage workflows directly within their application's code. Using a fluent, chainable API and functional helpers, you can quickly define, test, and run complex processes in-memory.

**Choose this path if you are:**
- Building background jobs for a web application.
- Creating complex, multi-step data processing pipelines.
- Looking for a structured way to manage complex `async/await` logic.

➡️ **[Learn how to build Programmatic Workflows](./programmatic/basics.md)**

### 2. Declarative Workflows (for Scale)

This is the path for architects and developers building dynamic, data-driven, or distributed systems. You define your workflow's structure as a declarative data format (like JSON), and the `GraphBuilder` "compiles" it into an executable, serializable `Blueprint`.

**Choose this path if you are:**
- Building a system where workflows are defined by users or stored in a database.
- Creating a runtime for dynamic AI agents.
- Architecting a distributed system where tasks are executed by a pool of workers.

➡️ **[Learn how to build Declarative Workflows](./declarative/basics.md)**

---

## Next Steps

Ready to dive in? Here's where to go next:

- **[Core Concepts](./core-concepts.md)**: Get a quick overview of the fundamental building blocks: `Node`, `Flow`, and `Context`.
- **[Getting Started: Your First Workflow](./getting-started.md)**: Jump right into the code and build a complete workflow in 5 minutes.
