# UWF Companion — VS Code Extension

Live data from [Universal Agent Workflow](../) SQLite skill databases, surfaced directly inside VS Code.

## Features

| Command | Description |
|---|---|
| `UWF: Open Workflow Dashboard` | Multi-panel operational dashboard with live workflow phase/status, archetype declarations, stage execution summary, and artifact visibility |
| `UWF: Open Workflow State` | Current workflow phase/status/agent and phase history timeline |
| `UWF: Open Stages` | Webview table of all workflow stages and their status |
| `UWF: Open Issues` | Webview table of all issues with milestone/sprint/status |
| `UWF: Open Requirements` | Requirements viewer (FR/NFR/AC) |
| `UWF: Open ADRs` | Architecture Decision Records |
| `UWF: Open Discoveries` | Discovery findings and open gaps |
| `UWF: Open Review Findings` | Quality/security review results |
| `UWF: Export Report (CSV/JSON)` | Export a snapshot of all databases to `tmp/reports/` |
| `UWF: Refresh All` | Manually refresh the sidebar tree and panels |

The Activity Bar sidebar ("UWF Companion") shows live workflow state, archetype count, planned artifact count, open issues, and active stages. All panels auto-refresh within **300 ms** of any database write.

Each panel now includes an **Open interactive view** action in the top-right that jumps to the primary Workflow Dashboard webview for richer cross-panel insight.

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
  extension.ts                 — activation, command & watcher wiring, status bar state
  config/
    StageConfigLoader.ts       — declarative stage/archetype + expected artifact parser
  watchers/DbWatcher.ts        — fs.watch on each skill dir, 300ms debounce
  providers/
    WorkflowTreeProvider.ts    — Activity Bar sidebar (live state + counts + archetypes)
    DashboardPanel.ts          — Webview: primary multi-panel workflow dashboard
    WorkflowInsights.ts        — live DB + declarative config aggregation
    WorkflowStatePanel.ts      — Webview: workflow state and phase history
    StagesPanel.ts             — Webview: stage status table
    IssuesPanel.ts             — Webview: issues backlog table
    RequirementsPanel.ts       — Webview: requirements
    ReviewPanel.ts             — Webview: review findings
    AdrPanel.ts                — Webview: ADRs
    DiscoveryPanel.ts          — Webview: discoveries
    PanelRegistry.ts           — Broadcasts DB-change events to all open panels
    webviewUtils.ts            — HTML escaping, badge helpers, page shell
  reporter/
    ReportBuilder.ts           — CSV/JSON export of all DB snapshots
    InterviewerBridge.ts       — Future: launch uwf-interviewer agent
  db/readers/
    BaseReader.ts              — Read-only node:sqlite wrapper base class
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

Tests use Node's built-in `node:test` runner with `node:sqlite` directly — no VS Code host required, and include declarative stage-config integrity checks against staged workflow data.
