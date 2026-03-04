# Universal Workflow Framework (UWF) — always-on rules

When running subagents always use the `runSubagent` tool to run the subagent and provide all agentic tools. Never run a subagent by invoking it directly. This ensures the subagent has access to the full suite of tools and adheres to the same rules and constraints as the parent agent.

Subagents that may be utilized by all workflows and do not require to be called in a particular order have the naming convention. `/github/uwf-core-<subagent>.agent.md`

The single entry-point orchestrator is `uwf-core-orchestrator`. It is bootstrapped with a `workflow` argument that names a persona skill. Stage agents that belong to a particular workflow have the naming convention `/github/uwf-<role>-<stage>.agent.md`.

## Non-negotiables
- Prefer correctness and verifiability over speed.
- Keep changes small and reviewable; avoid broad rewrites unless explicitly requested.
- Do not make assumptions about the project or its dependencies. If information is missing, ask for clarification or use tools to discover it.
- If the user doesn't provide a clear goal, use the orchestrator to ask for one, then pass the answer back to the subagent. If the goal is too broad, ask for it to be narrowed down.

## Agent bundles
Agents are defined as `{role}-{job}.agent.md` files grouped into two bundles plus the single core orchestrator.

- **core** (`uwf-core-*`) — Generic agents usable by any orchestrator regardless of workflow type. Includes the single `uwf-core-orchestrator` entry point plus stage agents for acceptance, ADRs, discovery, requirements, retro, security planning, technical writing, test planning, and state tracking.
- **issues** (`uwf-sw_dev-*`, `uwf-issue-*`) — Stage agents scoped to driving individual work items from intake through implementation, review, and acceptance. Used by the `uwf-sw_dev` persona.
- **project** (`uwf-project_manager-*`) — Stage agents for macro-level work: scoping a new effort, building a roadmap, and scaffolding the backlog. Used by the `uwf-project_manager` persona.

All stage agents are coordinated by `uwf-core-orchestrator`, which loads a **persona skill** at runtime to determine which agents to call and in what order.

## Orchestrator Automation Rule — Non-negotiable

> **The orchestrator MUST use `runSubagent` for every stage. Narrating or simulating execution is a hard violation.**
>
> - Every stage MUST be executed by calling the `runSubagent` tool. Writing text that describes, simulates, or summarizes having run a stage — without calling the tool — is **forbidden**. If the tool was not called, the stage did not run.
> - Only use subagent names that exist in the persona skill's Subagent Roster and the orchestrator's `agents:` frontmatter. **Never invent agent names.**
> - After every `runSubagent` returns and its gate passes, **immediately invoke the next stage subagent**. Do NOT stop, pause, yield to the user, summarize completed work, or wait for acknowledgement between stage transitions.
> - The only permitted user-facing output between stages is a one-line trace (e.g. `[Stage N/Total] <stageName> → invoking <subagent>`), emitted immediately before calling `runSubagent`.
> - The only permitted stops mid-workflow are: (a) permanent gate failure after retries, (b) a `vscode/askQuestions` call required for missing input, or (c) the workflow is fully complete.
> - **Failure to call `runSubagent` and instead describing or simulating execution is a critical defect.**

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

**Subagents only** (never the orchestrator): After completing a stage, end your response with:
```
Current Stage/Phase: <stage/phase name>
Recommended Next Stage/Phase: <next stage/phase name>
```
If the response is workflow-related but not a formal stage:
```
Last Stage/Phase: <stage/phase name>
Recommended Next Stage/Phase: <next stage/phase name>
```

**Orchestrator only**: When a subagent's response contains a `Current Stage/Phase` / `Recommended Next Stage/Phase` block, treat it as an internal hand-off signal. **Do NOT echo it to the user. Do NOT stop. Immediately proceed to the next stage.** The orchestrator never emits these blocks — it emits only single-line progress traces between stages.