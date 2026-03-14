# Universal Agent Workflow (UWF)

**Don't forget to enable custom subagents in settings it is experiemntal. Authorize like me you will be wwondering why nothing is getting edited or created**

A composable, role-based agent workflow framework. Import only the agent bundles you need, wire in the skills that match your tooling, and get a consistent, gate-enforced development lifecycle out of the box.

---

## How It Works

Agents are defined as `uwf-{role}-{job}.agent.md` files grouped into three workflow bundles: **core**, **sw_dev**, and **project_manager**.  This allows for bundles to be added and removed depending on the requirements making it easily extendable.  A front end developer may decide to create more specific engineer.  Also the generic custom agents can be extended with skills. Because core agents are generic and orchestrator-agnostic, you can use them standalone or combine them with the issues or project bundles depending on what you are building.  With core agents you can also extend through adding skills.  The core custom agent `uwf-core-project-tracking.agent.md` is designed to be used with any tracking skill, whether it's the default local file system or a GitHub Issues integration. This custom agents handles both the project state file and the tracking the issues and the various states they are in (open, active, closed).

Skills are separate from agents. A skill encapsulates a specific behavior — such as where and how work items are tracked — and is swapped in without changing the agent itself. Need GitHub Issues instead of local file tracking? Replace the tracking skill. Everything else stays the same.

```
.github/
├── agents/               # {role}-{job}.agent.md files, grouped by bundle
├── skills/               # Swappable behavior modules (uwf-{name}/SKILL.md)
├── prompts/              # Entry-point prompts to trigger a workflow
├── instructions/         # Always-on rules applied across the workspace
└── copilot-instructions.md
```

---

## Non-Negotiables

- **Plan before implementing.** No code or infrastructure changes before `tmp/workflow-artifacts/{mode}-intake.md` and `tmp/workflow-artifacts/{mode}-plan.md` exist for the active scope.
- **Verifiability over speed.** Correctness takes priority. Missing context is discovered or clarified, never assumed.
- **Small, reviewable changes.** Broad rewrites are prohibited unless explicitly requested.
- **Template preservation.** `./docs/workflow/*.md` are read-only examples. Active artifacts live in `tmp/workflow-artifacts/{mode}-*.md`.
- **No secrets in the repo.** If credentials are encountered, execution stops and secure storage is recommended.
- **Unplanned work is not silently implemented.** It is filed as a spike under `./tmp/state/ungroomed/open/` for triage.

---

## Agent Bundles (`.github/agents`)

Agents follow the naming convention `uwf-{role}-{job}.agent.md`. Import the bundles relevant to your use case.

### Core Bundle — `uwf-core-*`

Generic agents reusable by any orchestrator, regardless of whether you are running a project workflow, an issue workflow, or something else entirely.

| Agent file | Responsibility |
| :--- | :--- |
| `uwf-core-acceptance.agent.md` | Runs final acceptance checks, verifies commands, and documents known issues before closing work. |
| `uwf-core-adr.agent.md` | Produces Architecture Decision Records via the `uwf-adr-300` skill. |
| `uwf-core-discovery.agent.md` | Inspects the workspace to identify unknowns and constraints without making implementation changes. |
| `uwf-core-project-tracking.agent.md` | Manages workflow state transitions using whichever tracking skill is configured. |
| `uwf-core-requirements.agent.md` | Writes PRDs, Non-Functional Requirements, and testable acceptance criteria. |
| `uwf-core-retro.agent.md` | Runs end-of-cycle retrospectives and surfaces workflow or implementation improvements. |
| `uwf-core-security-plan.agent.md` | Generates threat models and security control plans via the `uwf-threat-model` skill. |
| `uwf-core-tehcnical-writer.agent.md` | Promotes ephemeral `tmp/` artifacts into permanent `./docs/` documentation and files gaps as backlog items. |
| `uwf-core-test-planner.agent.md` | Defines test stubs, integration scenarios, and coverage targets before implementation begins. |
| `uwf-core-blueprint.agent.md` | Synthesizes all First-phase outputs into the Canonical Build Spec (uwf-cbs) and initializes the Build Record (uwf-br) strata 0–4. Runs after `test-planner` as the final First-phase stage. |

### Software Developer (sw_dev) Bundle — `uwf-sw_dev-*` / `uwf-issue-*`

Agents scoped to driving individual work items from intake through implementation and review.

| Agent file | Responsibility |
| :--- | :--- |
| `uwf-sw_dev-orchestrator.agent.md` | Coordinates the full per-issue lifecycle: intake → discovery → test planning → implementation → review → acceptance. |
| `uwf-sw_dev-intake.agent.md` | Scopes a single work item: goal, acceptance criteria, constraints, and explicit out-of-scope boundaries. |
| `uwf-sw_dev-work-planner.agent.md` | Assembles upstream artifacts (tests, security controls, scope) into an ordered implementation plan. |
| `uwf-issue-implementer.agent.md` | Executes code and infrastructure changes strictly against the approved plan and ADRs. |
| `uwf-sw_dev-reviewer.agent.md` | Evaluates implementation quality, test coverage, and security controls. Produces a prioritized fix list or hands off to acceptance. |

### Project Manager (project_manager) Bundle — `uwf-project_manager-*`

Agents for macro-level work: scoping a new effort, building a roadmap, and scaffolding the backlog.

| Agent file | Responsibility |
| :--- | :--- |
| `uwf-project_manager-orchestrator.agent.md` | Coordinates the full project planning sequence: intake → discovery → requirements → timeline → backlog scaffold → hand-off. |
| `uwf-project_manager-intake.agent.md` | Captures objectives, non-goals, stakeholders, success metrics, and the intended work-breakdown strategy. |
| `uwf-project_manager-timeline-planner.agent.md` | Translates the project scope into a milestone/sprint/issue roadmap and creates the `./tmp/state/` directory structure. |
| `uwf-project_manager-reviewer.agent.md` | Audits the macro plan for completeness and consistency before execution begins. |

---

## Skills (`.github/skills`)

Skills encapsulate discrete behaviors. Agents call skills by name; swapping a skill changes the behavior without touching the agent. This is the primary extension point for integrating UWF with external tooling.

| Skill | Purpose | Swap example |
| :--- | :--- | :--- |
| `uwf-adr-300` | Creates high-rigor ADRs at `./docs/adr/ADR-####-<slug>.md` using a 300-point checklist covering security, ops, compliance, and testability. | — |
| `uwf-cbs` | Blueprint stage behavior: synthesizes First-phase outputs into the uwf-cbs SQLite database (components, interfaces, dependencies, sequencing, constraints) and initializes the uwf-br Build Record. Used by `uwf-core-blueprint`. | — |
| `uwf-local-tracking` | Manages work item state using the local filesystem (`./tmp/state/.../open/`, `active/`, `closed/`). | Replace with `uwf-github-track` to use GitHub Issues instead. |
| `uwf-review-to-issues` | Parses prioritized review or audit tables and creates ungroomed backlog items in `./tmp/state/ungroomed/open/`. | — |
| `uwf-state-manager` | Authoritative source for mutating `./docs/uwf-state.json` and managing phase lifecycle transitions. | — |
| `uwf-threat-model` | Generates STRIDE-style threat models with assets, trust boundaries, mitigations, and a verification checklist into `tmp/workflow-artifacts/{mode}-security-plan.md`. | — |

> **Tracking skill example:** The default tracking skill (`uwf-local-tracking`) uses the local file system. To integrate with GitHub, drop in a `uwf-github-track` skill that maps the same interface to GitHub Issues API calls. No agent files change.

---

## Entry Points (`.github/prompts`)

Prompts are the human-facing triggers that start a workflow run.

| Prompt | Triggers | Use when |
| :--- | :--- | :--- |
| `uwf-start-project_manager-planning.md` | `uwf-project_manager-orchestrator` | Starting a new product, feature, or architectural effort from scratch. |
| `uwf-start-development-with-issue.md` | `uwf-sw_dev-orchestrator` | Picking up a groomed, ready-to-implement work item and driving it to completion. |

---

## Instructions (`.github/instructions`)

Always-on rules applied automatically across the workspace.

| File | Scope | Purpose |
| :--- | :--- | :--- |
| `uwf-core.instructions.md` | `**` | Core stage gates, artifact expectations, orchestrator state rules, and workflow discipline. |
| `./docs-writing.instructions.md` | `./docs/**/*.md` | Writing conventions: skimmability, explicit assumptions, executable examples with expected output. |
| `slides.instructions.md` | `slides/**` | Slide structure and build conventions for programmatically compiled presentations. |

---

## Artifact Locations

| Artifact | Path |
| :--- | :--- |
| Workflow templates (read-only) | `./docs/workflow/{mode}-*.md` |
| Active intake | `tmp/workflow-artifacts/{mode}-intake.md` |
| Active discovery | `tmp/workflow-artifacts/{mode}-discovery.md` |
| Active security plan | `tmp/workflow-artifacts/{mode}-security-plan.md` |
| Active test plan | `tmp/workflow-artifacts/{mode}-test-plan.md` |
| Active implementation plan | `tmp/workflow-artifacts/{mode}-plan.md` |
| Acceptance results | `tmp/workflow-artifacts/{mode}-acceptance.md` |
| Architecture Decision Records | `./docs/adr/ADR-####-<slug>.md` |
| Open work items | `./tmp/state/<milestone>/<sprint>/open/<id>.md` |
| Active work items | `./tmp/state/<milestone>/<sprint>/active/<id>.md` |
| Closed work items | `./tmp/state/<milestone>/<sprint>/closed/<id>.md` |
| Ungroomed/unplanned work | `./tmp/state/ungroomed/open/<id>.md` |