# PiAgent SDK Integration Plan

This plan outlines the integration of the `@mariozechner/pi-coding-agent` SDK to replace the fragile CLI-based PiAgentAdapter with a robust, in-process execution model.

## Objective
Migrate the mock `PiAgentAdapter` to a real integration using the Pi Agent SDK for in-process, autonomous execution, addressing the core blocker of CLI execution fragility in background nodes.

## Wave 1: Dependency Management
**Goal:** Add the necessary SDK dependency to the Node package.

- **Action:** Add `@mariozechner/pi-coding-agent` to `packages/node/package.json`.
- **QA Gate:**
  - `pnpm install` completes successfully.
  - The `@mariozechner/pi-coding-agent` package is resolvable in the `packages/node/src` directory.

## Wave 2: Skill & Tool Bridge
**Goal:** Bridge Agent Mesh tools to the Pi SDK as Skills.

- **Action:** Register our mesh tools (e.g., `mesh-edit`, `mesh-tool`) as Skills within the Pi SDK configuration.
- **Details:** Map the Agent Mesh tool schemas and execution logic to the format expected by the Pi SDK's tool/skill registration mechanism.
- **QA Gate:**
  - Unit tests verify that a mocked Pi SDK session can correctly identify and invoke the registered Mesh tools.
  - Tool arguments are parsed and passed correctly from the Pi SDK to the Mesh tool handlers.

## Wave 3: Core Adapter Implementation
**Goal:** Implement the primary `execute` logic using the SDK.

- **Action:** Rewrite the `execute` method in the `PiAgentAdapter` (or create a new SDK-based adapter).
- **Details:**
  - Initialize the session using `createAgentSession()`.
  - Pass the task context, prompt, and registered skills.
  - Invoke `session.prompt()` to start the autonomous execution loop.
  - Ensure the implementation handles context window compaction and token limits natively via the SDK's built-in mechanisms (or custom callbacks if required).
- **QA Gate:**
  - The adapter successfully initializes a session.
  - The adapter can execute a basic prompt (e.g., "echo hello") without errors.
  - Token usage limits and compaction strategies are explicitly configured and validated in tests.

## Wave 4: Observability
**Goal:** Connect SDK events to the Mesh Coordinator.

- **Action:** Forward inner loop events from the Pi SDK to the Coordinator.
- **Details:**
  - Hook into the SDK's event streams (e.g., `thought`, `tool_call`, `tool_result`, `error`).
  - Translate these events into the Agent Mesh standard event format (e.g., task updates, logs).
  - Stream these events back to the Coordinator so they are visible in the web dashboard and CLI.
- **QA Gate:**
  - During execution, the Coordinator receives `thought` and `tool_call` events.
  - The Web Dashboard accurately reflects the inner state of the Pi Agent during execution.

## Wave 5: Verification
**Goal:** End-to-end validation via self-hosted execution.

- **Action:** Run a real Agent Mesh task that modifies code using the new SDK integration.
- **Details:**
  - Create a test task targeting a safe sandbox repository or a non-critical file in the current repo.
  - The task should require the agent to read a file, modify it using a Mesh tool, and verify the result.
- **QA Gate:**
  - The agent completes the task autonomously without crashing.
  - Code modifications are correct.
  - The task is marked as `completed` in the Coordinator.
  - The entire execution trace (thoughts, tool calls) is captured and verifiable in the task history.
