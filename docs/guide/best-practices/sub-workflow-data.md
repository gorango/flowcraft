# Best Practices: Data Flow in Sub-Workflows

When you compose workflows, managing the flow of data between the parent and child is critical for creating modular and predictable systems. By default, Flowcraft uses a **shared context**, which is simple but can lead to tight coupling.

This guide describes a powerful pattern for creating an explicit data boundary between flows, as demonstrated by the declarative `GraphBuilder` and its sub-workflow inlining.

## The Problem: A Leaky Context

Because the default behavior for programmatic, in-memory flows is a shared context, a sub-workflow has access to the parent's entire state. This can cause two main problems in large systems:

- **Input Pollution**: The sub-workflow has access to *everything* in the parent's context, making its dependencies implicit and hard to track. It's not clear from the sub-workflow's definition what data it actually needs to operate.
- **Output Pollution**: Temporary, internal state from the sub-workflow can leak out and accidentally overwrite values in the parent's context, causing unexpected side effects in later stages of the parent flow.

## The Solution: Explicit Input and Output Mapping

To solve this, the `GraphBuilder` uses a powerful pattern when it encounters a sub-workflow node. It automatically injects lightweight "gatekeeper" nodes that create a clean data boundary. The data contract is defined declaratively in your graph definition.

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

The `inputs` map defines **what data flows from the parent context into the sub-workflow's scope**.

- `"sub_flow_key"`: The `string` key that will be used *inside* the sub-workflow.
- `"parent_flow_key"`: The `string` key in the *parent* flow whose value will be copied.

**How it works:**
Before the sub-workflow runs, an `InputMappingNode` is executed. It iterates through the `inputs` map. For each entry, it asynchronously reads the value from `parent_flow_key` in the parent context and writes it to `sub_flow_key` in the same context.

This ensures the sub-workflow only receives the exact data it needs under the keys it expects, making it a pure, reusable component with clear dependencies.

### 2. The `outputs` Map

The `outputs` map defines **what data flows from the sub-workflow's scope back out to the parent's scope**.

- `"parent_flow_key_for_result"`: The `string` key in the *parent* flow where the result will be stored.
- `"sub_flow_output_key"`: The `string` key in the *sub-workflow* whose value will be copied.

**How it works:**
After the sub-workflow completes, an `OutputMappingNode` is executed. It iterates through the `outputs` map. For each entry, it asynchronously reads the value from `sub_flow_output_key` and writes it to `parent_flow_key_for_result` in the same context.

This prevents any temporary or internal variables from the sub-workflow from polluting the parent's state under unexpected keys. Only the explicitly defined outputs are promoted.

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

1. **Starts**: The context now contains a `user_to_greet` key (copied from the parent's `USER_OBJECT`).
2. **Internal Node `A`**: Reads `user_to_greet.name` and creates a string: `Hello, Alice!`. It stores this in an internal key, `temp_message`.
3. **Internal Node `B`**: Reads `temp_message`, adds an emoji, and stores the final string in `greeting_result`.
4. **Ends**.

**Data Flow:**

1. The `InputMappingNode` copies `await parentContext.get('USER_OBJECT')` into `await parentContext.set('user_to_greet', ...)`.
2. Sub-workflow `101` runs. The `temp_message` key exists only within its logical scope.
3. When it finishes, the context contains `greeting_result` with the value `"Hello, Alice! 👋"`.
4. The `OutputMappingNode` copies `await parentContext.get('greeting_result')` into `await parentContext.set('FINAL_GREETING_MESSAGE', ...)`.
5. The parent flow now has a `FINAL_GREETING_MESSAGE` key, but is completely unaware of the `temp_message` key.

By enforcing this explicit data contract, you can build complex, nested workflows that are as easy to reason about as pure functions.
