# What is Flowcraft?

**Flowcraft** is a lightweight, unopinionated, and progressively scalable runtime for executing declarative workflows defined as directed acyclic graphs (DAGs). It is designed to reliably orchestrate complex business processes, data pipelines, ETL workflows, or AI agent orchestrations with a focus on simplicity, portability, and extensibility.

## Core Philosophy

Unlike heavy platforms like Temporal or Airflow, or domain-specific libraries like LangChain, Flowcraft is a foundational engine that does one thing exceptionally well: **execute a graph of functions defined as data**. It provides a flexible, type-safe API to define workflows, execute them with resilience, and scale from in-memory scripts to distributed systems without changing the core business logic.

## Key Features

-   **Zero Dependencies**: Lightweight and dependency-free, ensuring a easy integration.
-   **Declarative Workflows**: Define workflows as serializable objects with nodes and edges.
-   **Unopinionated Logic**: Nodes can be simple functions or structured classes.
-   **Progressive Scalability**: Run blueprints in-memory or scale to distributed systems.
-   **Resilient Execution**: Built-in support for retries, fallbacks, timeouts, and cancellation.
-   **Advanced Patterns**: Includes batch processing and loops for complex workflows.
-   **Extensibility**: Pluggable loggers, evaluators, serializers, and middleware.
-   **Static Analysis**: Tools to detect cycles, validate blueprints, and generate visual diagrams.
-   **Type-Safe API**: Fully typed with TypeScript for a robust developer experience.
