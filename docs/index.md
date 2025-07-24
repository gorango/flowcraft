---
layout: home

hero:
  name: Cascade
  text: A Workflow Framework
  tagline: Build complex, multi-step processes, from simple sequences to dynamic, graph-driven AI agents.
  actions:
    - theme: brand
      text: Introduction
      link: /guide/
    - theme: alt
      text: Recipes
      link: /guide/recipes/
    - theme: alt
      text: Sandbox
      link: https://github.com/gorango/cascade/tree/master/sandbox

features:
  - title: Zero Dependencies
    icon: 🌱
    details: Lightweight and dependency-free, ensuring a small footprint and easy integration.
  - title: Composable & Reusable
    icon: 🧩
    details: Define workflows by chaining nodes or embedding other flows as nodes.
  - title: Extensible Execution Engine
    icon: 🔌
    details: A pluggable Executor pattern enables in-memory or distributed flows.
  # - title: Type-Safe
  #   icon: 🛡️
  #   details: Written in TypeScript to provide strong typing for your workflow definitions and context.
  # - title: Async by Default
  #   icon: ⚡
  #   details: Built on an asynchronous foundation to handle I/O-bound and CPU-bound tasks.
  - title: Middleware
    icon: 🥪
    details: Intercept execution of nodes to handle cross-cutting concerns like logging, timing, or auth.
  # - title: Conditional Branching
  #   icon: 🔀
  #   details: Direct the flow's execution path based on the results of any node.
  # - title: Retry Logic & Fallbacks
  #   icon: 🔄
  #   details: Retry failed operations with configurable delays and fallback logic.
  - title: Cancellation
    icon: 🛑
    details: Gracefully abort in-progress workflows using standard AbortControllers.
  # - title: Pluggable Logging
  #   icon: 📝
  #   details: Use the built-in ConsoleLogger or bring your own (e.g., Pino, Winston).
  - title: Dynamic Graph Engine
    icon: 🌐
    details: Define complex, graph-based workflows as simple JSON files.
  # - title: Fluent & Functional API
  #   icon: ✨
  #   details: A chainable API on the Node class and a collection of functional helpers.
---
