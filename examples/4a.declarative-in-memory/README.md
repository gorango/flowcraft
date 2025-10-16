# Declarative AI Agent - In-Memory Execution

This example demonstrates how to execute the declarative AI agent workflows from the shared logic package using Flowcraft's standard, in-memory `FlowRuntime`.

## Features

- **In-Memory Execution**: Showcases the default, high-performance `FlowRuntime` for running workflows within a single process.
- **Separation of Concerns**: Consumes the `@flowcraft/example-declarative-shared-logic` package, clearly separating the execution environment from the agent's business logic.
- **Dynamic Workflow Loading**: The runtime is configured with all blueprints and node implementations provided by the shared package.

## How to Run

1.  **Install dependencies**:
    From the root of the `flowcraft` project, run:
    ```bash
    npm install
    ```

2.  **Set your OpenAI API key**:
    Create a `.env` file in this project's root directory (`examples/4a.declarative-in-memory/`):

    ```
    OPENAI_API_KEY="your-api-key-here"
    ```

3.  **Choose a Use-Case**:
    Open `src/main.ts` and configure the `ACTIVE_USE_CASE` constant to select which workflow to run.

    ```typescript
    // src/main.ts
    const ACTIVE_USE_CASE: UseCase = '4.content-moderation';
    ```

4.  **Run the application**:

    ```bash
    npm start
    ```

## How It Works

This example is a lightweight runner that demonstrates the core runtime:

1.  **Import Logic**: It imports the `blueprints`, `agentNodeRegistry`, and `config` from the `@flowcraft/example-declarative-shared-logic` package.
2.  **Initialize Runtime**: It creates an instance of `FlowRuntime`, passing the imported `blueprints` and `registry` into its configuration.
3.  **Execute Workflow**: It selects the active blueprint and initial context based on the `ACTIVE_USE_CASE` constant and calls `runtime.run()`.

All the complex logic (subflows, conditional branching, fan-out) is defined in the shared JSON files and handled transparently by the in-memory runtime.

For a detailed breakdown of the available use-cases and their workflow graphs, see the **[shared logic codebase](../4.declarative-shared-logic/README.md)**.
