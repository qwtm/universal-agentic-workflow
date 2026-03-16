# Universal Workflow Framework (UWF) — always-on rules

When running subagents always use the `runSubagent` tool to run the subagent and provide all agentic tools. Never run a subagent by invoking it directly. This ensures the subagent has access to the full suite of tools and adheres to the same rules and constraints as the parent agent.

Subagents that may be utilized by all workflows and do not require to be called in a particular order are infrastructure agents with the naming convention `uwf-core-<name>.agent.md`.

The single entry-point orchestrator is `uwf-core-orchestrator`. It is bootstrapped with a `workflow` argument that names a persona skill. Canonical stage agents use the naming convention `uwf-stage-{stage}.agent.md`; legacy workflow-specific stage agents that have not yet been migrated use `uwf-{role}-{job}.agent.md`.

## Non-negotiables
- Prefer correctness and verifiability over speed.
- Keep changes small and reviewable; avoid broad rewrites unless explicitly requested.
- Do not make assumptions about the project or its dependencies. If information is missing, ask for clarification or use tools to discover it.
- If the user doesn't provide a clear goal, use the orchestrator to ask for one, then pass the answer back to the subagent. If the goal is too broad, ask for it to be narrowed down.

## Agent bundles
Agents follow three naming conventions:

- **Canonical stage agents** (`uwf-stage-*`) — stages migrated to the `stage_type` capability architecture. Traits supply behavioral variation; the agent is shared across workflows. Currently migrated: `uwf-stage-intake`, `uwf-stage-discovery`.
- **Core / infrastructure agents** (`uwf-core-*`) — cross-cutting agents for orchestration, tracking, acceptance, snapshot, and other infrastructure concerns. Reserved for infrastructure; `core` is not used for stage capability agents.
- **Legacy workflow-specific stage agents** (`uwf-sw_dev-*`, `uwf-issue-*`, `uwf-project_manager-*`, etc.) — persona-bound stage agents that have not yet been migrated to `uwf-stage-*`. These keep their current names until their own migration issue.

All stage agents are coordinated by `uwf-core-orchestrator`, which loads a **persona skill** at runtime to determine which agents to call and in what order.

## Orchestrator Automation Rule — Non-negotiable

> All orchestration rules, the per-stage execution loop, gate enforcement, and the `runSubagent` contract are defined in `.github/skills/uwf-orchestration-engine/SKILL.md`. The orchestrator reads and follows that skill at startup.

## Skills are swappable behaviors
Skills (`uwf-{name}/SKILL.md`) encapsulate discrete behaviors. Agents reference skills by name; swapping a skill changes the behavior without modifying the agent.

**Engine and persona skills (orchestration layer):**
The process is fully automated with subagents and must not stop after each stage. The orchestrator uses the `runSubagent` tool to run each stage agent in sequence. After each stage, it automatically determines the next stage and continues without requiring user intervention, unless a decision point requires input.
- `uwf-orchestration-engine` — The single engine governing how all orchestration works: invocation contract, gate enforcement, retry limits, and the review fix-loop. Loaded by `uwf-core-orchestrator` at startup.
- `uwf-project_manager` — Persona skill: stage sequence, gate definitions, and subagent roster for macro-level project planning. Bootstrap `uwf-core-orchestrator` with `workflow=project_manager`.
- `uwf-sw_dev` — Persona skill: stage sequence, gate definitions, and subagent roster for issue-driven software development. Bootstrap `uwf-core-orchestrator` with `workflow=sw_dev`.

**Adding a new workflow** — Create `.github/skills/uwf-{name}/SKILL.md` following the persona skill structure defined in `uwf-orchestration-engine`. Add any new stage agents to the `agents:` list in `uwf-core-orchestrator.agent.md`. Then bootstrap with `workflow={name}`.

**Other swappable skills:**
- Default tracking behavior: `uwf-local-tracking` may be overridden by user input.
- To use a different ADR format: substitute an alternative to `uwf-adr`.

## Security baseline
- No secrets in repo. If credentials appear, stop and recommend secure storage.
- Prefer least-privilege. Default deny for risky operations.
- Explicitly document authn/authz decisions in `tmp/workflow-artifacts/master-security-plan.md`.

## Must always

**Subagents only** (never the orchestrator): After completing a stage, end your response with `Current Stage/Phase` / `Recommended Next Stage/Phase` blocks as defined in `.github/skills/uwf-orchestration-engine/SKILL.md`.