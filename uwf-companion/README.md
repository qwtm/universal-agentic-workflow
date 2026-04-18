# UWF Companion — VS Code Extension

Live data from [Universal Agent Workflow](../) SQLite skill databases, surfaced directly inside VS Code.

## Features

| Command | Description |
|---|---|
| `UWF: Open Workflow Dashboard` | Multi-panel workflow insight view (state, stages, planned artifacts, issues, requirements, discoveries) with per-section interactive drill-down buttons |
| `UWF: Open Workflow State` | Current phase/status/history from state manager DB |
| `UWF: Open Stages` | Webview table of all workflow stages and their status |
| `UWF: Open Issues` | Webview table of all issues with milestone/sprint/status |
| `UWF: Open Requirements` | Requirements viewer (FR/NFR/AC) |
| `UWF: Open ADRs` | Architecture Decision Records |
| `UWF: Open Discoveries` | Discovery findings and open gaps |
| `UWF: Open Review Findings` | Quality/security review results |
| `UWF: Export Report (CSV/JSON)` | Export a snapshot of all databases to `tmp/reports/` |
| `UWF: Refresh All` | Manually refresh the sidebar tree |

The Activity Bar sidebar ("UWF Companion") now includes a **Workflow Dashboard** launcher and live counts for open issues and active stages. The dashboard provides a slideout-style multi-panel summary and each section has an **Open interactive view ↗** action that opens a richer editor webview for deep inspection. All panels auto-refresh within **300 ms** of any database write.

### Declarative configuration

The dashboard reads workflow archetype/stage/artifact expectations from a declarative stages config (`stages.yaml`) under `.github/skills/...`.

You can override which config is used via VS Code setting:

- `uwf.workflowStagesPath` (default: `.github/skills/uwf-sw_dev/stages.yaml`)

## Requirements

- VS Code 1.85+
- A workspace with `.github/skills/` containing UWF skill databases
- Node.js 20+ (for building from source)

## Building from Source

```bash
cd uwf-companion
npm install
npm run build          # produces dist/extension.js
```

## Running in Development

1. Open `uwf-companion/` in VS Code (or the parent workspace).
2. Press **F5** — a new Extension Development Host window opens.
3. Open any UWF workspace; the extension activates automatically when `.github/skills/` is detected.

## Packaging a VSIX

```bash
npm run package        # produces uwf-companion-0.1.0.vsix
```

Install the VSIX:

```bash
code --install-extension uwf-companion-0.1.0.vsix
```

## Architecture

```
src/
  extension.ts                 — activation, command & watcher wiring
  watchers/DbWatcher.ts        — fs.watch on each skill dir, 300ms debounce
  providers/
    WorkflowTreeProvider.ts    — Activity Bar sidebar (live issue/stage counts + dashboard entry)
    WorkflowDashboardPanel.ts   — Primary multi-panel workflow insight dashboard
    WorkflowSectionPanel.ts     — Interactive drill-down webview opened per dashboard section
    StagesPanel.ts             — Webview: stage status table
    IssuesPanel.ts             — Webview: issues backlog table
    RequirementsPanel.ts       — Webview: requirements (stub → full in next release)
    ReviewPanel.ts             — Webview: review findings (stub)
    AdrPanel.ts                — Webview: ADRs (stub)
    DiscoveryPanel.ts          — Webview: discoveries (stub)
    PanelRegistry.ts           — Broadcasts DB-change events to all open panels
    webviewUtils.ts            — HTML escaping, badge helpers, page shell
  reporter/
    ReportBuilder.ts           — CSV/JSON export of all DB snapshots
    InterviewerBridge.ts       — Future: launch uwf-interviewer agent
  services/
    WorkflowInsightsService.ts  — Aggregates DB + declarative stages.yaml insights
  db/readers/
    BaseReader.ts              — Read-only better-sqlite3 wrapper base class
    IssuesReader.ts            — uwf-issues.db
    AdrReader.ts               — uwf-adrs.db
    DiscoveryReader.ts         — uwf-discoveries.db
    RequirementsReader.ts      — uwf-requirements.db
    ReviewReader.ts            — uwf-reviews.db
    QuestionsReader.ts         — uwf-questions.db
    StageReader.ts             — uwf-stages.db
    WorkflowStateReader.ts     — uwf-state.db
```

**Security note:** All webview content is HTML-escaped via `webviewUtils.escHtml`. The extension never writes to any database; all mutations must go through the skill CLI scripts (`*.mjs`).

## Running Tests

```bash
npm test
```

Tests use Node's built-in `node:test` runner and `better-sqlite3` directly — no VS Code host required.
