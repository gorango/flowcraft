# Interactive Human-in-the-Loop (HITL) Workflow Example

This example demonstrates an interactive human-in-the-loop workflow where human approval is required before task execution in Flowcraft. Unlike simulated workflows, this example actually prompts the user for real-time decisions via terminal input.

## Overview

The workflow implements a customer refund approval process that requires interactive human review:
1. Prepares a refund task
2. Prompts the user for approval/rejection via terminal input
3. Executes approved tasks or handles rejections based on user decision

## Features Demonstrated

- **Interactive Human Input**: Real-time user prompts for decision making
- **Conditional Workflow Execution**: Branching based on actual human decisions
- **Context-Driven Logic**: Storing and retrieving approval status
- **Error Handling**: Proper handling of rejected tasks
- **Middleware Integration**: Custom HITL middleware for logging workflow steps
- **Terminal-Based Interaction**: Demonstrates how to integrate user input into workflows

## Running the Example

```bash
cd examples/advanced/hitl-workflow
pnpm install
pnpm start
```

## Expected Output

The example runs a single workflow execution with interactive human review:

- **Preparation**: Creates a task with amount $99.99 for "Product defect"
- **Human Review**: Prompts the user with task details and asks for approval (y/n)
- **Execution**: Based on user input, either processes the refund or handles rejection

The workflow demonstrates real human-in-the-loop interaction, showing how Flowcraft can incorporate actual user decisions into automated processes.