### &nbsp;&nbsp;&nbsp;🚀 Features

- Add batch:start event emission and toGraphRepresentation method &nbsp;-&nbsp; by **Goran** [<samp>(54d19)</samp>](https://github.com/gorango/flowcraft/commit/54d19e8)
- Implement human-in-the-loop orchestration for workflows &nbsp;-&nbsp; by **Goran** [<samp>(d040b)</samp>](https://github.com/gorango/flowcraft/commit/d040b2a)
- Support multiple concurrent wait nodes &nbsp;-&nbsp; by **Goran** [<samp>(f3cb2)</samp>](https://github.com/gorango/flowcraft/commit/f3cb21d)
- Add batch:finish event for batch operation completion &nbsp;-&nbsp; by **Goran** [<samp>(663fa)</samp>](https://github.com/gorango/flowcraft/commit/663faa2)
- **core**:
  - Introduce dependency injection container &nbsp;-&nbsp; by **Goran** [<samp>(02884)</samp>](https://github.com/gorango/flowcraft/commit/0288401)
- **errors**:
  - Centralize error handling with unified FlowcraftError class &nbsp;-&nbsp; by **Goran** [<samp>(61e11)</samp>](https://github.com/gorango/flowcraft/commit/61e11f2)
- **flow**:
  - Automate loop exit edge wiring for intuitive API &nbsp;-&nbsp; by **Goran** [<samp>(4ab5b)</samp>](https://github.com/gorango/flowcraft/commit/4ab5b75)
  - Automate batch edge wiring for intuitive API &nbsp;-&nbsp; by **Goran** [<samp>(8f00d)</samp>](https://github.com/gorango/flowcraft/commit/8f00dba)
- **runtime**:
  - Enhance event bus with detailed execution tracing &nbsp;-&nbsp; by **Goran** [<samp>(f0606)</samp>](https://github.com/gorango/flowcraft/commit/f0606bf)
- **testing**:
  - Export testing utilities via secondary entry point &nbsp;-&nbsp; by **Goran** [<samp>(e90fe)</samp>](https://github.com/gorango/flowcraft/commit/e90fe99)
  - Enhance createStepper with prev() and reset() methods &nbsp;-&nbsp; by **Goran** [<samp>(6103b)</samp>](https://github.com/gorango/flowcraft/commit/6103ba5)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- Add StepByStepOrchestrator and stepper testing utilities &nbsp;-&nbsp; by **Goran** [<samp>(d6ad3)</samp>](https://github.com/gorango/flowcraft/commit/d6ad398)
- Add counter to hash fn to ensure uniqueness for identical fns &nbsp;-&nbsp; by **Goran** [<samp>(6c591)</samp>](https://github.com/gorango/flowcraft/commit/6c59122)
- **runtime**:
  - Correct subflow resume logic and data flow &nbsp;-&nbsp; by **Goran** [<samp>(f9256)</samp>](https://github.com/gorango/flowcraft/commit/f92566e)
  - Simplify fallback mechanism &nbsp;-&nbsp; by **Goran** [<samp>(18ba0)</samp>](https://github.com/gorango/flowcraft/commit/18ba0f9)
  - Resolve incorrect 'stalled' status for conditional workflows &nbsp;-&nbsp; by **Goran** [<samp>(455a3)</samp>](https://github.com/gorango/flowcraft/commit/455a30b)
  - Make fallbacks implicitly inherit successors &nbsp;-&nbsp; by **Goran** [<samp>(bc189)</samp>](https://github.com/gorango/flowcraft/commit/bc18929)
  - Traverser from state calculation &nbsp;-&nbsp; by **Goran** [<samp>(33eae)</samp>](https://github.com/gorango/flowcraft/commit/33eaebf)

##### &nbsp;&nbsp;&nbsp;&nbsp;[View changes on GitHub](https://github.com/gorango/flowcraft/compare/@flowcraft/sqs-adapter@1.2.1...master)