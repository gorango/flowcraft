# flowcraft

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
