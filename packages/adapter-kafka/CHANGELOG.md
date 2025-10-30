# @flowcraft/kafka-adapter

## 1.4.2

### Patch Changes

- - Fix FlowRuntime constructor registry handling for DI containers

    - The container-based FlowRuntime configuration was failing because the node registry from createDefaultContainer was an object, but FlowRuntime expected a Map.

  - Resolve distributed execution bug by properly instantiating WorkflowState

    - Modified WorkflowState constructor to accept optional IAsyncContext for distributed contexts
    - Updated BaseDistributedAdapter to create WorkflowState
    - Handled TrackedAsyncContext deltas for proper persistence in distributed execution

- Updated dependencies
  - flowcraft@2.7.1

## 1.4.1

### Minor Changes

- **New Features**

  - Added workflow versioning to support distributed systems, enabling better tracking and management of workflow evolution
  - Added a heartbeat mechanism for long-running distributed jobs to ensure reliability and monitoring

### Patch Changes

- Updated dependencies
  - flowcraft@2.6.0
