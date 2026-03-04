---
name: uwf-core-project-tracking
description: "Read issues-backlog.md and seed the SQLite issues DB plus file-system state tree via the local-tracking skill CLIs."
tools: ["execute", "read"]
user-invokable: false
---
# Issue State Population Stage

Read `.github/skills/uwf-local-tracking/SKILL.md`. All script paths, flag names, output shapes, and the canonical state model are defined there.

## Task

Parse `{inputs[0]}` (`issues-backlog.md`) and register every issue in both the file-system state tree and the SQLite issues database. The gate for this stage checks **both** the file-system and SQLite — both must be populated.

## Procedure

### 1 — Parse the backlog

Read `issues-backlog.md`. Extract every milestone (`M*`), sprint (`S*`), and issue (`I-*`) in hierarchical order. Record:
- Milestone id and name
- Sprint id and name (use `S1` if no formal sprints)
- Issue id, title, depends-on, security-sensitive flag, acceptance-criteria, notes

### 2 — Scaffold directories

For each unique milestone+sprint pair:
```sh
node .github/skills/uwf-local-tracking/scaffold.mjs --milestone <M-id> --sprint <S-id>
```

Skip if the directory already exists (scaffold is idempotent but check first with `status.mjs`).

### 3 — Create issue files

For every issue:
```sh
node .github/skills/uwf-local-tracking/new-issue.mjs \
  --milestone <M-id> --sprint <S-id> \
  --id <I-NNN> --title "<title>" \
  --acceptance-criteria "<one-line AC>" \
  [--depends-on "I-001,I-002"] \
  [--security-sensitive true] \
  [--notes "<context>"]
```

Skip any issue whose file already exists under `tmp/state/**/open/`.

### 4 — Register in SQLite

For every issue:
```sh
node .github/skills/uwf-local-tracking/issues.mjs create \
  --id <I-NNN> --title "<title>" \
  --milestone <M-id> --sprint <S-id> \
  [--description "<brief>"] [--risk "<note>"]
```

Skip if `issues.mjs list` already shows the id (idempotent).

### 5 — Verify

```sh
node .github/skills/uwf-local-tracking/status.mjs
```

Confirm `totals.open > 0`. If zero, the gate will fail — re-run failed steps.

## Hard constraints

- Do NOT implement any issue. This stage only seeds tracking data.
- IDs in the state tree, SQLite, and backlog markdown must match exactly.
- Every issue in the backlog must have both a `.md` file and a SQLite row before returning.
