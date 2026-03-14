# Universal Agentic Workflow (UWF) — Architecture Spec

## Concept

UWF is an orchestrated multi-stage workflow framework for AI-assisted project delivery. It operates in two modes:

1. **Agent-orchestrated** — A root orchestrator agent delegates to subagents (custom agents), each scoped to a workflow stage.
2. **Human-orchestrated** — The user drives sequencing manually via semi-guided prompt files, invoking stages on demand.

The orchestrator is not a fixed persona. It assumes **archetypes** (implemented as skills) that define its domain lens — e.g., Project Manager or Software Developer. Archetypes shape which stages activate and how the orchestrator reasons about work, without hardcoding behavior.

---

## Mapping to GitHub Copilot Customization Primitives

| UWF Concept | Copilot Primitive | Location | Rationale |
|---|---|---|---|
| Orchestrator behavior | `AGENTS.md` / `copilot-instructions.md` | `.github/copilot-instructions.md` | Always-on project context and orchestration rules |
| Archetypes (PM, SWE) | **Skills** (`.github/skills/<archetype>/SKILL.md`) | `.github/skills/project-manager/`, `.github/skills/software-developer/` | Loaded on demand when the orchestrator determines relevance. Avoids static context bloat. Each archetype bundles its own stage sequencing, quality gates, and domain vocabulary. |
| Workflow stages | **Custom Agents** (`.github/agents/<stage>.agent.md`) | `.github/agents/` | Each stage is an isolated agent profile with scoped tools, prompt, and MCP access. Subagent isolation keeps context windows clean. |
| Semi-guided prompts | **Prompt Files** (`.github/prompts/<action>.prompt.md`) | `.github/prompts/` | Reusable `/slash` commands for human-orchestrated mode. E.g., `/intake`, `/discover`, `/plan-timeline`. |
| Quality gates / hooks | **Hooks** (`hooks.json`) | `.github/hooks/` | Event-driven automation on `sessionStart`, `sessionEnd`, `userPromptSubmitted`. Enforce deterministic policies (traceability checks, status enum validation) that the model must not skip. |
| Always-on coding standards | **Instructions** (`.github/instructions/*.instructions.md`) | `.github/instructions/` | File-pattern-scoped rules. E.g., `markdown.instructions.md` for story format enforcement, `yaml.instructions.md` for ADR schema compliance. |

---

## Workflow Stages

### Phase 1 — Foundation (shared across all archetypes)

Every workflow begins here regardless of archetype. The goal is situational awareness and constraint capture.

| Stage | Agent Profile | Purpose |
|---|---|---|
| **Intake** | `uwf-intake.agent.md` | Parse the request. Classify scope (task, feature, epic, project). Identify actors, constraints, and initial domain terms. |
| **Discovery** | `uwf-discovery.agent.md` | Audit the existing codebase/project state. Enumerate what exists, what's missing, and what's stale. Produce a lay-of-the-land summary. |
| **Requirements** | `uwf-requirements.agent.md` | Elicit and structure functional + non-functional requirements. Output structured user stories (see Story Schema below). |
| **ADR** | `uwf-adr.agent.md` | Capture architectural decisions using a standard ADR template. Link each decision to the requirement(s) it resolves. |
| **Risk Planner** | `uwf-core-risk-planner.agent.md` | Identify and document project-level execution risks: schedule, dependency, technical-debt, and external. Produce a risk register. Appends to uwf-br layer 1; flags blocking dependency risks in layer 2. Feeds slippage risk signals into user stories for the Refinement stage. |
| **Security Planner** | `uwf-core-security-plan.agent.md` | Threat model the proposed scope. Identify attack surfaces, data classification, auth/authz requirements. Output security stories or constraints. |
| **Test Planner** | `uwf-core-test-planner.agent.md` | Define the test strategy: unit/integration/E2E ratio, coverage targets, critical path tests, test data requirements. |
| **Blueprint** | `uwf-core-blueprint.agent.md` | Synthesize all First-phase outputs into the Canonical Build Spec (uwf-cbs) SQLite database and initialize the Build Record (uwf-br) strata 0–4. Produces the machine-readable handoff artifact from Phase 1 to Phase 2. |

### Phase 2 — Execution (archetype-specific, pick one)

#### Archetype: Project Manager

| Stage | Agent Profile | Purpose |
|---|---|---|
| **Intake (PM)** | `uwf-pm-intake.agent.md` | Refine scope into milestones, epics, and delivery phases. Stakeholder mapping. |
| **Timeline Planner** | `uwf-timeline-planner.agent.md` | Sequence milestones. Identify critical path, parallel workstreams, and dependency chains. Produce sprint/roadmap artifact. |
| **Reviewer** | `uwf-pm-reviewer.agent.md` | Validate plan completeness: all stories assigned, dependencies resolved, risk signals addressed, NFRs covered. |

#### Archetype: Software Developer

| Stage | Agent Profile | Purpose |
|---|---|---|
| **Intake (SWE)** | `uwf-swe-intake.agent.md` | Decompose requirements into implementation tasks. Identify files, modules, and interfaces to touch. |
| **Work Planner** | `uwf-work-planner.agent.md` | Sequence implementation tasks. Identify build order, test-first candidates, and integration points. |
| **Reviewer** | `uwf-swe-reviewer.agent.md` | Code-level review gate: SOLID compliance, test coverage, security checks, ADR conformance. |

### Phase 3 — Closure (shared across all archetypes)

| Stage | Agent Profile | Purpose |
|---|---|---|
| **Project Tracking** | `uwf-tracking.agent.md` | Populate the local tracking cache. Sync story status, update traceability matrix, append changelog. |
| **Refinement** | `uwf-refinement.agent.md` | Groom unrefined stories to meet the quality standard (see Quality Controls below). Reject stories that fail completeness checks. |
| **Acceptance** | `uwf-acceptance.agent.md` | Verify acceptance criteria are met. Run traceability audit: story → ADR → code → test. Flag gaps. |
| **Snapshot** | `uwf-core-snapshot.agent.md` | Produce `uwf-drs` — the Deterministic Reconstruction Spec. Serialize accepted state with pinned versions, resolved dependency graph, executed build sequence, full ADR set, gap log, and divergence log. Close `uwf-br` layer 5 and append a closure entry to `uwf-changelog`. |
| **Retro** | `uwf-retro.agent.md` | Post-mortem on the workflow execution. Capture what worked, what didn't, and improvement actions for future iterations. |

---

## Story Schema

Every user story must conform to this schema before exiting Refinement:

| Field | Constraint |
|---|---|
| `id` | Deterministic, sequential (e.g., `US-0001`) |
| `title` | Concise, verb-first |
| `role` | Actor/persona |
| `goal` | What the actor wants to accomplish |
| `rationale` | The "so that" clause — substantive, not filler |
| `acceptance_criteria` | Structured, binary, testable (ID'd as `AC-0001+`) |
| `priority` | Ordered enum (Critical / High / Medium / Low) |
| `domain_tag` | Bounded context or module |
| `dependencies` | References to other story IDs or ADRs |
| `status` | Enum: `draft` · `refined` · `in-progress` · `review` · `done` · `blocked` |
| `story_points` | Optional but consistent when used |
| `slippage_risk_signal` | Optional. Populated during Refinement from risk-planner output. References one or more Risk IDs (e.g., `RSK-0001,RSK-0003`) where the risk's `linked_story_ids` includes this story. Signals that this story is on a risk path and may require re-scoping or contingency planning. |

---

## Quality Controls (Refinement Gate)

Stories entering Phase 3 must pass these checks:

| Control | Description |
|---|---|
| **Grounding** | Every claim traces to a requirement, ADR, or discovery finding. |
| **Sourcing** | External references are cited and verifiable. |
| **Traceability** | Bidirectional links exist: Story ↔ ADR ↔ Code ↔ Test. |
| **Disambiguation** | No ambiguous pronouns, vague scope, or undefined terms. |
| **Decomposition correctness** | Stories are independently deliverable. No hidden coupling. |
| **Dependency resolution** | All dependencies are identified, ordered, and non-circular. |
| **Constraint compliance** | Security, performance, and accessibility constraints are addressed. |
| **Slippage risk signal** | Stories with a populated `slippage_risk_signal` field serve as the flag — this field is sourced from risk-planner output and populated during Refinement. Any story with a non-empty `slippage_risk_signal` must be reviewed for re-scoping or contingency planning before refinement completes. |
| **NFR coverage** | Non-functional requirements are explicitly addressed, not assumed. |

---

## Artifact Inventory

| Artifact | ID | Type | Format | Maintained By | Purpose |
|---|---|---|---|---|---|
| User Stories | `uwf-stories` | Planning | Markdown + CSV | `uwf-tracking` agent | Work item backlog |
| Traceability Matrix | `uwf-tm` | Planning | Markdown | `uwf-tracking` agent | Story → ADR → Code → Test links |
| ADR Set | `uwf-adrs` | Architecture | Markdown | `uwf-adr` agent | Per-decision records |
| Risk Register | `uwf-risk` | Planning | Markdown | `uwf-core-risk-planner` agent | Project-level risk register: schedule, dependency, technical-debt, and external risks. Appended to uwf-br layer 1. Blocking dependency risks also flagged in layer 2. Feeds `slippage_risk_signal` on user stories. |
| Sprint / Roadmap | `uwf-sprint` | Execution | Markdown | Orchestrator | Milestone sequencing |
| Canonical Build Spec | `uwf-cbs` | Planning | SQLite | `uwf-core-blueprint` agent | Component inventory, interface contracts, dependency graph, build sequencing, and constraint registry. Assembled from First-phase artifacts; not a parallel source of truth. |
| Build Record | `uwf-br` | Operational | JSON | `uwf-core-blueprint` agent (init, strata 0–4), `uwf-core-snapshot` agent (closes stratum 5) | Append-only layered execution log with strata 0 (context), 1 (decisions and risk register), 2 (dependencies, including blocking risk entries), 3 (actions), 4 (verification), 5 (final state — populated at closure by snapshot stage). |
| Deterministic Reconstruction Spec | `uwf-drs` | Operational | JSON | `uwf-core-snapshot` agent | Point-in-time backward-looking record of what was built and why. Contains accepted components with pinned versions, resolved dependency graph, executed build sequence, full ADR set with rationale, confidence scores for brownfield-inferred entries, gap log, and divergence log. Enables a cold-starting AI agent to reconstruct or extend the system without re-deriving prior decisions. |
| Changelog | `uwf-changelog` | Operational | Append-only log | `uwf-tracking` agent (progress entries), `uwf-core-snapshot` agent (closure entry) | Progress audit trail |

---

## On CBS and DRS — Do You Need Them?

> Note: Earlier drafts treated CBS and DRS as optional, hand-authored “mega-docs.” In the current design, `uwf-cbs` (Canonical Build Spec database) and `uwf-drs` (Deterministic Reconstruction Spec) are first-class, machine-maintained artifacts produced by the blueprint and snapshot stages. This section is only about whether you need **separate, human-maintained CBS/DRS documents**, not about removing those structured artifacts from the workflow.

The Canonical Build Spec (CBS) and Deterministic Reconstruction Spec (DRS) in your original doc tried to capture "everything needed to reproduce the project from scratch." That's a real concern, but the framing was overloaded — it blurred several distinct responsibilities:

| Responsibility | Better Analog | Already Covered By |
|---|---|---|
| What to build | Software Requirements Specification (IEEE 830) | `uwf-stories` + `uwf-requirements` agent |
| How it's structured | System Design Document / Architecture spec | `uwf-adrs` + Discovery output |
| Cross-domain contracts | Interface Control Document (ICD) | ADRs scoped to integration boundaries |
| Complete parts enumeration | Bill of Materials (BOM) | Traceability Matrix + dependency graph |
| Build sequencing | Build manifest / CI pipeline definition | `uwf-work-planner` output + CI config |
| Environment reproduction | IaC + container definitions | Out of scope for UWF (delegate to infra tooling) |

**Recommendation:** Drop CBS and DRS as standalone artifacts. Instead, ensure the existing artifacts compose into a reproducible picture:

- The **Traceability Matrix** is your BOM — it enumerates everything and links it.
- The **ADR Set** is your architecture record — it captures decisions, not just structure.
- The **Work Planner output** is your sequencing spec — it orders the build.
- **Environment reproduction** is a separate concern (Dockerfiles, IaC, lockfiles) that UWF can *validate* but shouldn't *own*.

If you genuinely need a single "hand this to a new team and they can rebuild everything" artifact for enterprise compliance, make it a **skill** (`uwf-cbs` skill) that *generates* a composite document by assembling existing artifacts — not a parallel source of truth.

---

## Gap Analysis — What's Missing?

| Gap | Proposed Addition | Primitive |
|---|---|---|
| **Estimation** | No stage for effort estimation or complexity scoring. Refinement assumes points exist but nothing produces them. | Add `uwf-estimation.agent.md` between Refinement and Acceptance, or fold into Refinement. |
| ~~**Risk Register**~~ | ~~Security Planner covers threats but not project-level risks (schedule, scope, resource, technical debt).~~ | **Addressed.** `uwf-core-risk-planner.agent.md` added to Phase 1 (after `adr`, before `security-planner`). Produces a risk register appended to uwf-br layer 1. Blocking dependency risks flagged in layer 2. Slippage risk signals traced to user stories via `slippage_risk_signal` field. |
| **Definition of Done** | Quality Controls define story-level checks but there's no explicit DoD for the workflow itself. | Add a `dod.instructions.md` that hooks enforce. |
| **Handoff Protocol** | No formal contract for how one stage passes output to the next. Currently implicit. | Define a `handoff-contract.instructions.md` specifying required output schema per stage. Hooks validate on stage transition. |
| **Context Carryover** | In agent-orchestrated mode, how does the orchestrator pass accumulated state between subagent invocations? | Use the `/nextturn` pattern you've already designed — subagents write progress to files, orchestrator reads on resume. Formalize as a skill. |
| **Archetype Composition** | PM and SWE archetypes are mutually exclusive in Phase 2. Some workflows need both (plan then build). | Allow archetype chaining: Phase 2a (PM) → Phase 2b (SWE). The orchestrator skill should define valid chains. |

---

## Proposed Repository Layout

```
universal-agentic-workflow/
├── .github/
│   ├── copilot-instructions.md          # Always-on orchestrator context
│   ├── agents/
│   │   ├── uwf-intake.agent.md          # Phase 1
│   │   ├── uwf-discovery.agent.md
│   │   ├── uwf-requirements.agent.md
│   │   ├── uwf-adr.agent.md
│   │   ├── uwf-security-planner.agent.md
│   │   ├── uwf-test-planner.agent.md
│   │   ├── uwf-pm-intake.agent.md       # Phase 2: PM
│   │   ├── uwf-timeline-planner.agent.md
│   │   ├── uwf-pm-reviewer.agent.md
│   │   ├── uwf-swe-intake.agent.md      # Phase 2: SWE
│   │   ├── uwf-work-planner.agent.md
│   │   ├── uwf-swe-reviewer.agent.md
│   │   ├── uwf-tracking.agent.md        # Phase 3
│   │   ├── uwf-refinement.agent.md
│   │   ├── uwf-acceptance.agent.md
│   │   ├── uwf-core-snapshot.agent.md
│   │   └── uwf-retro.agent.md
│   ├── skills/
│   │   ├── project-manager/
│   │   │   └── SKILL.md                 # PM archetype definition
│   │   ├── software-developer/
│   │   │   └── SKILL.md                 # SWE archetype definition
│   │   ├── uwf-cbs/
│   │   │   └── SKILL.md                 # Composite build spec generator
│   │   ├── uwf-snapshot/
│   │   │   └── SKILL.md                 # Snapshot stage — uwf-drs producer
│   │   └── uwf-nextturn/
│   │       └── SKILL.md                 # Context carryover protocol
│   ├── instructions/
│   │   ├── story-format.instructions.md  # Enforces story schema on *.md
│   │   ├── adr-format.instructions.md    # Enforces ADR template
│   │   ├── handoff-contract.instructions.md
│   │   └── dod.instructions.md
│   ├── prompts/
│   │   ├── intake.prompt.md             # /intake
│   │   ├── discover.prompt.md           # /discover
│   │   ├── plan-timeline.prompt.md      # /plan-timeline
│   │   ├── refine.prompt.md             # /refine
│   │   └── accept.prompt.md             # /accept
│   └── hooks/
│       ├── validate-story-schema/
│       │   ├── README.md
│       │   └── hooks.json               # Runs on sessionEnd
│       └── enforce-traceability/
│           ├── README.md
│           └── hooks.json               # Runs on PR creation
├── AGENTS.md                             # Cross-agent project instructions
├── artifacts/
│   ├── stories/                          # user_stories.md + user_story_tracker.csv
│   ├── adrs/
│   ├── traceability/
│   ├── sprint/
│   └── changelog/
└── README.md
```

---

## Example Agent Profile

```markdown
---
name: uwf-requirements
description: >
  Elicit and structure functional and non-functional requirements
  from intake and discovery outputs. Produces user stories conforming
  to the UWF story schema.
tools:
  - read_file
  - edit_file
  - search_files
---

You are a requirements engineer operating within the Universal Agentic Workflow.

## Inputs
- `artifacts/stories/` — existing backlog (may be empty)
- Discovery summary from `uwf-discovery` output
- Intake classification from `uwf-intake` output

## Outputs
- New or updated user stories in `artifacts/stories/user_stories.md`
- Updated tracker in `artifacts/stories/user_story_tracker.csv`

## Behavior
1. Read all discovery and intake outputs.
2. For each identified capability or constraint, produce a user story
   conforming to the story schema defined in
   `.github/instructions/story-format.instructions.md`.
3. Assign sequential IDs continuing from the highest existing ID.
4. Flag any requirement that cannot be decomposed into a single
   testable story — mark as `epic` for further decomposition.
5. Do not invent requirements. If ambiguity exists, produce a
   clarification question rather than an assumption.
```

---

## Example Skill (Archetype)

```markdown
---
name: project-manager
description: >
  PM archetype for the UWF orchestrator. Activates project planning
  stages and applies portfolio-level reasoning to scope, timeline,
  and risk decisions.
---

# Project Manager Archetype

When this skill is active, the orchestrator should:

## Stage Sequencing
1. Phase 1: intake → discovery → requirements → adr → risk-planner → security-planner → test-planner
2. Phase 2: pm-intake → timeline-planner → pm-reviewer
3. Phase 3: tracking → refinement → acceptance → retro

## Domain Vocabulary
- **Milestone**: A time-boxed delivery boundary containing one or more epics.
- **Epic**: A grouping of related stories that deliver a coherent capability.
- **Sprint**: A fixed-length iteration (default: 2 weeks) within a milestone.

## Quality Lens
- Prioritize dependency resolution and critical path identification.
- Flag stories without business rationale as incomplete.
- Ensure every milestone has at least one measurable success criterion.

## Handoff Rules
- Phase 1 → Phase 2: Requires completed ADR set and approved requirements.
- Phase 2 → Phase 3: Requires approved timeline with no unresolved blockers.
```
