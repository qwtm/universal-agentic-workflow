# Proposal: UWF Companion — VS Code Extension

> **Status: Implemented.** The extension described in this document has been built and is available in [`uwf-companion/`](../uwf-companion/). This document is retained as the design record and rationale for the implementation decisions. For usage, build, and test instructions, see [`uwf-companion/README.md`](../uwf-companion/README.md).

## Recent Enhancements (Dashboard + Interactive Drill-down)

The implemented extension now includes a dedicated **Workflow Dashboard** command and sidebar entry. The dashboard consolidates workflow state, stage execution progress, declarative artifact plans, issues, requirements, and discoveries into a multi-panel view. Each panel includes an **Open interactive view ↗** action that opens a richer editor webview for focused exploration.

The dashboard also consumes declarative workflow configuration from `stages.yaml` (archetype, stage agent mapping, and planned outputs) and supports overriding the default path via setting `uwf.workflowStagesPath`.

## Overview

A VS Code extension that surfaces live data from the UWF SQLite skill databases directly inside the editor. As agents run and write to the databases, the extension reflects those changes in real time — giving developers a single-pane view of every decision, requirement, finding, and open question across the active workflow.

When a workflow run completes (or stalls), the extension can either generate a formatted report via Copilot or hand control to a new `uwf-interviewer` agent that questions the user interactively to fill in gaps before the report is finalized.

---

## Problem

UWF agents produce structured data across eight SQLite databases. Today that data is invisible unless someone runs CLI commands manually. There is no ambient visibility into what the workflow has decided, what is still open, or what findings are blocking progress.

**Assumptions:**
- Users run UWF from within a VS Code workspace.
- All skill databases are co-located under `.github/skills/*/`.
- The `better-sqlite3` node module is already present in each skill folder.
- The extension reads databases; it never writes to them directly.

---

## Databases in Scope

| Database | Skill | What It Tracks |
|---|---|---|
| `uwf-state.db` | `uwf-state-manager` | Workflow phase, active agent, run history |
| `uwf-stages.db` | `uwf-orchestration-engine` | Stage start/complete, retry counts, gate results |
| `uwf-questions.db` | `uwf-question-protocol` | Open questions, required vs optional, answers |
| `uwf-adrs.db` | `uwf-adr` | Architectural decisions, status, links |
| `uwf-discoveries.db` | `uwf-discovery` | Workspace findings by category, open gaps |
| `uwf-requirements.db` | `uwf-requirements` | FR/NFR/DR/AC/RK items, MoSCoW priority, source |
| `uwf-reviews.db` | `uwf-review` | Review runs, findings by severity, verdicts |
| `uwf-issues.db` | `uwf-local-tracking` | Backlog issues, state transitions |

---

## Extension Architecture

```
src/
  extension.ts           — activation, command registration
  watchers/
    DbWatcher.ts         — fs.watch on each *.db file; debounced refresh
  providers/
    WorkflowTreeProvider.ts   — Activity Bar tree: stages, questions, findings
    RequirementsPanel.ts      — Webview panel for requirements table
    ReviewPanel.ts            — Webview panel for review findings
    AdrPanel.ts               — Webview panel for ADR list
    DiscoveryPanel.ts         — Webview panel for discoveries / open gaps
  reporter/
    ReportBuilder.ts      — Renders a Markdown report from all DB snapshots
    InterviewerBridge.ts  — Launches uwf-interviewer agent with gap context
  db/
    readers/              — One typed reader per database (read-only)
```

**Technology choices:**
- VS Code Webview API for rich panels (tables, badges, collapsible sections)
- `better-sqlite3` (sync, no native build required — bundled via esbuild)
- `fs.watch` + debounce (300 ms) for live DB change detection
- VS Code TreeView API for the Activity Bar sidebar

---

## Core Views

### 1. Workflow Status — Activity Bar Sidebar

A tree view titled **UWF Workflow** always visible in the Activity Bar.

```
▾ Workflow: sw_dev  [phase: review]
    ✅ intake
    ✅ discovery      3 gaps logged
    ✅ requirements   12 items (8 FR, 4 NFR)
    ✅ adr            2 ADRs
    ⏭  security-plan  skipped (not security-sensitive)
    ✅ test-plan
    ✅ work-plan
    ✅ implementation
    🔄 review         2 open findings (1 critical)
    ⬜ acceptance
    ⬜ retro

  ▾ Open Questions (2)
      ❓ [required] Which auth strategy? — intake
      ❓ [optional] Max payload size? — requirements

  ▾ Open Findings (2)
      🔴 critical  Missing error handling in auth.ts — review
      🟡 major     NFR-003 not tested — review
```

Badge on the Activity Bar icon shows the count of open critical findings + unanswered required questions.

---

### 2. Requirements Panel (Webview)

Command: `UWF: Open Requirements`

A filterable table of all requirements with inline status badges.

| ID | Type | Priority | Title | Status | Source |
|---|---|---|---|---|---|
| FR-001 | Functional | Must | User login | accepted | intake |
| NFR-003 | Non-Functional | Should | Response < 200 ms | pending | discovery |
| RK-001 | Risk | Must | Token expiry handling | pending | security-plan |

- Filter by type, priority, status
- Click a row → expand description + acceptance criteria inline
- **Export** button → copies table as Markdown

---

### 3. Review Findings Panel (Webview)

Command: `UWF: Open Review Findings`

Groups findings by review run, then by severity.

```
Review #1 — sw_dev / review  [verdict: changes_requested]
  🔴 critical (1)
    ► Missing error handling in auth.ts
  🟡 major (1)
    ► NFR-003 not covered by any test
  🟢 minor (3)
    ► ...

Review #2 — sw_dev / acceptance  [verdict: pending]
  (in progress)
```

- Resolved findings shown greyed-out with strike-through
- **Copy Finding IDs** button → copies open IDs for paste into implementer prompt

---

### 4. Discoveries Panel (Webview)

Command: `UWF: Open Discoveries`

Filterable by category (`gap`, `workspace_structure`, `dependency`, `recommendation`, `unknown`).

- Open gaps highlighted in amber
- Each row shows `source_stage`, `description`, and `status`
- **Show Gaps Only** toggle

---

### 5. ADR Panel (Webview)

Command: `UWF: Open ADRs`

List of all ADRs with status badges (`proposed`, `accepted`, `superseded`, `deprecated`). Click to open the markdown file in the editor.

---

## Report Generation

Command: `UWF: Generate Workflow Report`

**Flow:**
1. Extension reads all databases and builds a structured snapshot.
2. Calls Copilot (via the VS Code Language Model API) with the snapshot as context and a system prompt instructing it to write a clean Markdown report.
3. Report is opened in a new editor tab as an untitled `.md` file.
4. User can save it anywhere or trigger **Export as PDF** (via a VS Code markdown preview + print).

**Report sections:**
- Executive summary (workflow, phase, verdict)
- Requirements registry (table)
- Architecture decisions (ADR list)
- Security & threat model summary
- Review findings (grouped by severity)
- Open gaps & unknowns
- Open questions (unanswered)
- Retro notes (if available)

---

## Interviewer Handoff

Command: `UWF: Fill Gaps with Interviewer`

When a report has gaps — unanswered questions, open requirements, unknown discoveries — the extension can hand off to a new `uwf-interviewer` agent instead of generating a report immediately.

**Flow:**
1. Extension serializes all open items (questions, gaps, pending requirements) into a structured context block.
2. Launches the `uwf-interviewer` agent (via `runSubagent`) with that context.
3. The interviewer asks the user targeted questions one at a time (via `vscode/askQuestions`).
4. Each answer is written back to the appropriate database via the skill CLI:
   - Unanswered questions → `questions.mjs answer --id <n> --answer "..."`
   - New requirements surfaced → `requirements.mjs add ...`
   - Gaps closed → `discoveries.mjs close --id <n>`
5. Once no open required questions remain, the interviewer signals completion and the extension auto-triggers **Generate Workflow Report**.

**`uwf-interviewer` agent responsibilities:**
- Never ask more than one question at a time.
- Prioritize `required` questions before `optional` ones.
- For each unknown discovery: ask a single clarifying question, not a free-form dump.
- After each answer, re-evaluate whether downstream gaps have been resolved.
- Emit a `INTERVIEW_COMPLETE` signal when all required items are resolved.

---

## UX Details

### Live update behavior
- Panels update within 300 ms of any DB write.
- A subtle status bar item shows `UWF: sw_dev › review` with a spinner when a stage is active.
- No polling — uses `fs.watch` on DB file mtime.

### Read-only guarantee
- The extension NEVER writes to any skill database directly.
- All writes go through the skill CLI scripts (`*.mjs`).
- This ensures the extension cannot corrupt agent state.

### Workspace detection
- On activation, the extension scans for `.github/skills/*/workflow-schema.yaml` to detect UWF presence.
- If not found, all commands are hidden and a one-time notification appears: "UWF not detected in this workspace."

---

## New Agent Required

### `uwf-core-interviewer`

| Field | Value |
|---|---|
| File | `.github/agents/uwf-core-interviewer.agent.md` |
| Tools | `vscode/askQuestions`, `execute`, `read` |
| User-invokable | No (launched by extension or orchestrator) |
| Skill | `uwf-interviewer/SKILL.md` (to be created) |

**Inputs (from extension):**
```json
{
  "openQuestions": [...],
  "openGaps": [...],
  "pendingRequirements": [...],
  "context": "workflow snapshot summary"
}
```

**Output:** `INTERVIEW_COMPLETE` signal + all items resolved in their respective databases.

---

## Checklist: What Must Be Built

**Extension:**
- [ ] `DbWatcher.ts` — fs.watch on all 8 DBs with debounce
- [ ] `WorkflowTreeProvider.ts` — sidebar tree
- [ ] `RequirementsPanel.ts` — webview
- [ ] `ReviewPanel.ts` — webview
- [ ] `DiscoveryPanel.ts` — webview
- [ ] `AdrPanel.ts` — webview
- [ ] `ReportBuilder.ts` — LLM-assisted Markdown report
- [ ] `InterviewerBridge.ts` — context serialization + agent launch
- [ ] Workspace detection on activation
- [ ] Status bar item with active stage / spinner
- [ ] `package.json` with contributes: commands, views, menus

**New skill + agent:**
- [ ] `.github/skills/uwf-interviewer/SKILL.md`
- [ ] `.github/agents/uwf-core-interviewer.agent.md`

**Documentation:**
- [ ] `docs/uwf-vscode-extension-proposal.md` ← this document
- [ ] Extension `README.md` (in `vscode-extension/` subfolder when built)

---

## Open Questions

1. Should the extension be published to the VS Code Marketplace or distributed as a `.vsix` within this repo? No
2. Should `uwf-interviewer` also be callable directly from the orchestrator (not just from the extension) for headless/CI use? Yes, but with a different input format (e.g. YAML file instead of extension context).
3. Should the report export support formats other than Markdown (e.g. HTML, PDF)? YES, but Markdown is the MVP target.
4. Should the extension require a specific node version or bundle `better-sqlite3` as a WASM fallback for web-based VS Code (vscode.dev)? YES, bundle as WASM for maximum compatibility but for MVP target desktop VS Code with native `better-sqlite3` is fine.
