---
name: uwf-project_manager-timeline-planner
description: "Produce the timeline roadmap (tmp/workflow-artifacts/project-plan.md) and create the issue file-system state structure under state/. No implementation."
tools: ["agent", "todo", "search", "edit", "read", "execute"]
user-invokable: false
---
# Timeline Planning Stage
This stage produces the **roadmap** and **issue state structure**. It is NOT an implementation plan. Do not write code, create source files, or produce implementation steps.

## CRITICAL Pre-flight Check

Before generating issues:

1. Read `./tmp/workflow-artifacts/project-intake.md`
2. Verify the Goal section has substantive content (not `...`, `[TBD]`, `[TODO]`, or other placeholders)
3. If intake is empty or contains only placeholder values, return this error:
   ```
   GATE FAILURE: project-intake.md contains placeholder values. Cannot plan without project goal.

   The intake stage must capture the actual project goal before timeline planning can begin.
   ```

**Do NOT generate meta-planning issues** like:
- "Define project objectives"
- "Populate intake document"
- "Establish requirements"
- "Set up repository structure"

These indicate an upstream failure. The intake stage is responsible for capturing the project goal. If you see placeholders in the intake document, it means the intake stage did not complete successfully.

**Only generate issues related to the actual project deliverables** described in the Goal section.

---

## Outputs

Outputs are declared in `stages.yaml` and resolved by the orchestrator. Write to each path in `{outputs}`.

---

## Required: Seed the State Tree and SQLite

After writing `issues-backlog.md` and `project-roadmap.md`, you MUST call the local-tracking skill CLIs to register every issue. Do not skip this — the next stage gate verifies SQLite and the file-system state tree.

### Step 1 — Scaffold milestone/sprint directories

For each milestone+sprint combination in the backlog, call `scaffold.mjs` once:

```sh
node .github/skills/uwf-local-tracking/scaffold.mjs --milestone <M-id> --sprint <S-id>
```

Expected output: `{ "dirs": ["tmp/state/M1-.../S1-.../open", ...] }`

### Step 2 — Create issue files

For every issue in the backlog call `new-issue.mjs`:

```sh
node .github/skills/uwf-local-tracking/new-issue.mjs \
  --milestone <M-id> \
  --sprint <S-id> \
  --title "<issue title>" \
  --id <I-NNN> \
  --acceptance-criteria "<one-line AC>" \
  [--depends-on "I-001,I-002"] \
  [--security-sensitive true] \
  [--notes "<context>"]
```

Expected output: `{ "created": "tmp/state/.../open/I-NNN.md", "id": "I-NNN", "title": "..." }`

### Step 3 — Register each issue in SQLite

For every issue, also call `issues.mjs create` to register it in the SQLite tracking DB:

```sh
node .github/skills/uwf-local-tracking/issues.mjs create \
  --id <I-NNN> \
  --title "<issue title>" \
  --milestone <M-id> \
  --sprint <S-id> \
  [--description "<brief description>"] \
  [--risk "<risk note>"]
```

### Step 4 — Verify

After seeding all issues, run the status check to confirm:

```sh
node .github/skills/uwf-local-tracking/status.mjs
```

Confirm `totals.open > 0` in the output. If it is 0, something went wrong — re-run the failed steps before returning.

### Rules

- IDs must be sequential: `I-001`, `I-002`, … matching the backlog exactly.
- Every issue in `issues-backlog.md` MUST have a corresponding file AND a SQLite record.
- Do not create issues for milestones or sprints themselves — only for leaf-level work items.
- `scaffold.mjs` creates directories only — call it before `new-issue.mjs` for the same milestone/sprint.
