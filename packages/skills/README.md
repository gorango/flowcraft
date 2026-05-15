# @flowcraft/skills

AI assistant skills for Flowcraft workflow development. This package provides structured, contextual knowledge that AI assistants can use to help developers build, debug, and scale workflows.

## Structure

Each skill module is a self-contained knowledge domain with a `SKILL.md` entry point and supporting reference documents.

### Building Workflows (`building-workflows/`)

Workflow creation using Flowcraft's fluent API or declarative JSON blueprints.

- **SKILL.md** — Quick start, core primitives (nodes, edges, context), patterns, runtime API
- **advanced.md** — Loops, batches, subflows, HITL, sleep timers, webhook triggers
- **patterns.md** — Sequential pipelines, conditional branching, error handling, fan-out/fan-in, cancellation
- **examples.md** — Real-world examples (order processing, content moderation, ETL, image processing)

### Debugging Workflows (`debugging-workflows/`)

Testing, debugging, and troubleshooting workflow executions.

- **SKILL.md** — Test utilities, event assertions, time-travel replay, troubleshooting checklist
- **testing.md** — `InMemoryEventLogger`, `runWithTrace`, `Stepper`, testing best practices
- **time-travel.md** — Persistent event storage, replay architecture, event types, practical use cases
- **common-errors.md** — Stalled workflows, missing implementations, cycles, edge conditions, retries

### Scaling Workflows (`scaling-workflows/`)

Progressive scalability from in-memory to distributed execution.

- **SKILL.md** — Architecture overview, adapter setup, durable primitives, middleware, observability
- **primitives.md** — SleepNode, WaitNode, WebhookNode, SubflowNode detailed reference
- **middleware.md** — Middleware pipeline, lifecycle hooks, OpenTelemetry, event bus, event types
- **adapters/** — Configuration references for BullMQ, SQS, RabbitMQ, GCP, Azure, Kafka, Cloudflare, Vercel

### Compiler Workflows (`compiler-workflows/`)

Imperative-to-declarative compiler for writing workflows with familiar TypeScript.

- **SKILL.md** — Compiler overview, `@flow`/`@step` annotations, quick start
- **authoring-guide.md** — Supported control flow, subflows, unsupported syntax, golden rules
- **configuration.md** — `flowcraft.config.ts`, programmatic API, build tool integration

### Extending Flowcraft (`extending-flowcraft/`)

Pluggable components for customizing runtime behavior.

- **SKILL.md** — Overview of extensibility points
- **serializers.md** — `ISerializer`, `JsonSerializer`, `SuperJsonSerializer`, complex types
- **evaluators.md** — `IEvaluator`, `PropertyEvaluator`, `UnsafeEvaluator`, custom evaluators
- **loggers.md** — `ILogger`, custom loggers, integration with Winston/Pino
- **orchestrators.md** — `IOrchestrator`, `DefaultOrchestrator`, `StepByStepOrchestrator`, `EventDrivenOrchestrator`, `ResumptionOrchestrator`

### Workflow Analysis (`workflow-analysis/`)

Static analysis, visualization, and CLI tools.

- **SKILL.md** — Overview of analysis and visualization tools
- **static-analysis.md** — `analyzeBlueprint`, `checkForCycles`, `lintBlueprint`, compile-time type safety
- **visualization.md** — `generateMermaid`, `generateMermaidForRun`, `toGraphRepresentation`
- **cli.md** — `@flowcraft/cli`, `flowcraft inspect`, configuration, roadmap

## Usage

These skills are designed for AI assistant consumption. Each `SKILL.md` file contains frontmatter metadata that helps assistants determine when to apply a skill:

```yaml
---
name: building-workflows
description: Build and execute workflows using Flowcraft's fluent API or declarative JSON blueprints...
---
```

## Authoring Skills

When adding new skills:

1. Create a directory under `packages/skills/`
2. Add a `SKILL.md` with frontmatter (`name`, `description`)
3. Add supporting `.md` files for detailed reference
4. Cross-reference related skills using relative links

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).
