# Best Practices: Data Flow in Sub-Workflows

When you compose workflows using the `SubWorkflowNode` (as seen in the Dynamic Graph Engine example), managing the flow of data between the parent and child is critical for creating modular and predictable systems. Cascade provides a powerful mapping pattern to control this data flow explicitly.

## The Problem: A Leaky Context

By default, a sub-workflow runs with a *new, separate* `Context`. If you don't explicitly pass data in, it will be isolated. However, you often need to provide the sub-workflow with inputs and get results back.

A naive approach might be to share the same context instance, but this leads to a "leaky context":

-   **Input Pollution**: The sub-workflow has access to *everything* in the parent's context, making its dependencies implicit and hard to track.
-   **Output Pollution**: Temporary, internal state from the sub-workflow can leak out and accidentally overwrite values in the parent's context, causing unexpected side effects.

## The Solution: Explicit Input and Output Mapping

The `SubWorkflowNode` in our examples is designed to solve this by creating a clean, explicit boundary. Its data configuration in the JSON graph definition includes `inputs` and `outputs` maps.

```json
{
  "id": "my_sub_workflow_node",
  "type": "sub-workflow",
  "data": {
    "workflowId": 201,
    "inputs": {
      "sub_flow_key": "parent_flow_key"
    },
    "outputs": {
      "parent_flow_key_for_result": "sub_flow_output_key"
    }
  }
}
```

### 1. The `inputs` Map

The `inputs` map defines **what data flows from the parent context into the sub-workflow's context**.

-   `"sub_flow_key"`: The `ContextKey` that will be used *inside* the sub-workflow.
-   `"parent_flow_key"`: The `ContextKey` in the *parent* flow whose value will be copied.

**How it works:**
Before the sub-workflow runs, the `SubWorkflowNode` creates a new, empty context. It then iterates through the `inputs` map. For each entry, it reads the value from `parent_flow_key` in the parent context and writes it to `sub_flow_key` in the sub-workflow's context.

This ensures the sub-workflow only receives the exact data it needs, making it a pure, reusable component with clear dependencies.

### 2. The `outputs` Map

The `outputs` map defines **what data flows from the sub-workflow's context back out to the parent context**.

-   `"parent_flow_key_for_result"`: The `ContextKey` in the *parent* flow where the result will be stored.
-   `"sub_flow_output_key"`: The `ContextKey` in the *sub-workflow* whose value will be copied.

**How it works:**
After the sub-workflow completes, the `SubWorkflowNode` iterates through the `outputs` map. For each entry, it reads the value from `sub_flow_output_key` in the sub-workflow's context and writes it to `parent_flow_key_for_result` in the parent's context.

This prevents any temporary or internal variables from the sub-workflow from leaking out and polluting the parent's state. Only the explicitly defined outputs are passed back.

### Example: A User Greeter Sub-Workflow

Imagine a parent flow that has a `USER_OBJECT`. We want to call a sub-workflow that generates a greeting.

**Parent Flow Graph Node:**
```json
{
  "id": "generate_greeting",
  "type": "sub-workflow",
  "data": {
    "workflowId": 101,
    "inputs": {
      "user_to_greet": "USER_OBJECT"
    },
    "outputs": {
      "FINAL_GREETING_MESSAGE": "greeting_result"
    }
  }
}
```

**Sub-Workflow (ID: 101):**
1.  **Starts**: Receives a context containing only `user_to_greet` (copied from the parent's `USER_OBJECT`).
2.  **Internal Node `A`**: Reads `user_to_greet.name` and creates a string: `Hello, Alice!`. It stores this in an internal key, `temp_message`.
3.  **Internal Node `B`**: Reads `temp_message`, adds an emoji, and stores the final string in `greeting_result`.
4.  **Ends**.

**Data Flow:**
1.  The `SubWorkflowNode` copies `parentContext.get('USER_OBJECT')` into `subContext.set('user_to_greet', ...)`.
2.  Sub-workflow `101` runs. The `temp_message` key exists only within its context.
3.  When it finishes, its context contains `greeting_result` with the value `"Hello, Alice! 👋"`.
4.  The `SubWorkflowNode` copies `subContext.get('greeting_result')` into `parentContext.set('FINAL_GREETING_MESSAGE', ...)`.
5.  The parent flow now has a `FINAL_GREETING_MESSAGE` key, but is completely unaware of the `temp_message` key.

By enforcing this explicit data contract, you can build complex, nested workflows that are as easy to reason about as pure functions.
