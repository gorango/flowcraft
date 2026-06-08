# flowcraft

## 2.10.1

### Patch Changes

- Improve tree shaking in core, disable source maps, and improve test coverage.

## 2.10.0

### Minor Changes

- Implement queue-native retries and idempotency guards, delegating retries from process nodes to distributed workers where they can be implemented.

## 2.9.3

### Patch Changes

- Hyphenated node IDs now work correctly in edge conditions and loop transforms by rewriting them to bracket notation. A race condition where `addCompletedNode` wasn't awaited has been resolved, preventing all conditional branches from firing simultaneously. When resuming from a `.wait()` node, the traverser now correctly skips branches whose routing was already decided, and fan-in convergence nodes properly receive input from whichever predecessor triggered them. Node outputs are also now accessible directly by node ID in addition to `_outputs.*` for more intuitive condition expressions.

## 2.9.2

### Patch Changes

- Allow FlowRuntime instantiation without arguments

## 2.9.1

### Patch Changes

- Fix edge transforms and export built-in node classes for easier composition

## 2.9.0

### Minor Changes

- This release introduces convenience methods to simplify workflow execution and improves reliability of sleep/resume functionality.
  Key improvements:

  Features:
  - Added FlowBuilder.run() and FlowBuilder.resume() methods that automatically handle function registry passing, reducing boilerplate code
  - Enhanced WorkflowScheduler to properly store and restore function registries during auto-resume operations

  Fixes:
  - Fixed SleepNode to correctly preserve output passthrough when transitioning between sleep and resume states
  - Removed unused createForSubflow method from FlowRuntime that was causing confusion

  Docs:
  - Documented FlowBuilder.run/resume and WorkflowScheduler APIs

## 2.8.1

### Patch Changes

- Upgrade to Typescript 6

## 2.8.0

### Minor Changes

**Features**

- Evaluate conditional edges from loop controllers for early loop exit (#659c59e)

**Fixes**

- Throw descriptive error when loop controller lacks continue edge (#13906a5)
- Refactor loop detection to reset all nodes for re-execution (#a4af9f0)
- Fix loop siblings not executing by removing dead code (#a4af9f0)
- Fix FlowRuntime constructor registry handling for DI containers (#cb3be5d)
- Fix distributed execution by properly instantiating WorkflowState (#77e54d5)

**Docs**

- Add loop controller error handling section (#3d0495c)
- Document conditional edges from loop controllers (#3d0495c)

## 2.7.1

### Patch Changes

- Fix FlowRuntime constructor registry handling for DI containers
  - The container-based FlowRuntime configuration was failing because the node registry from createDefaultContainer was an object, but FlowRuntime expected a Map.

- Resolve distributed execution bug by properly instantiating WorkflowState
  - Modified WorkflowState constructor to accept optional IAsyncContext for distributed contexts
  - Updated BaseDistributedAdapter to create WorkflowState
  - Handled TrackedAsyncContext deltas for proper persistence in distributed execution

## 2.7.0

### Minor Changes

- Add time-travel debugging with persistent event storage and workflow replay.
  - Add `PersistentEventBusAdapter` and `IEventStore` interface for event persistence
  - Add `FlowRuntime.replay()` method for reconstructing workflow state from events
  - Add new event types: `job:enqueued`, `job:processed`, `job:failed`
  - Update context change events to include operation type

## 2.6.1

### Patch Changes

- feff500: **Test Suite Enhancements:**
  - Comprehensive test coverage improvements across runtime, evaluators, and flow components
  - Added fuzz testing and security boundary validation
  - Enhanced performance and resource testing capabilities
  - Cross-environment compatibility testing
  - End-to-end integration test scenarios

  **Runtime Fixes:**
  - Enhanced runtime with configurable scheduler and circular reference handling
  - Added null safety checks in runtime components
  - Prevented prototype pollution in blueprint sanitizer
  - Fixed infinite loop prevention with negative concurrency values

  **Code Quality:**
  - Improved test coverage thresholds and enforcement
  - Better error handling and validation throughout the codebase

## 2.6.0

### Minor Changes

- **New Features**
  - Added workflow versioning to support distributed systems, enabling better tracking and management of workflow evolution
  - Implemented a heartbeat mechanism for long-running distributed jobs to ensure reliability and monitoring
  - Added `generateMermaidForRun` function for visualizing execution paths in analysis workflows

  **Improvements**
  - Upgraded Vitest coverage configuration for better test reporting
  - Refactored code by moving components into the core package for better organization
