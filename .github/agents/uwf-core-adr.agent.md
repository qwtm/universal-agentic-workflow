---
name: uwf-core-adr
description: "Create ADRs and decision records (use 300-point ADR when warranted)."
tools: ["agent", "todo", "search", "edit", "read", "execute","web"]
user-invokable: false
argument-hint: "role (required): artifact filename prefix; outputPath (default ./tmp/workflow-artifacts): base directory for stage artifacts; adrPath (default ./docs/adr): where ADR files are written."
---

## Arguments

| Argument     | Default                    | Description                                             |
|--------------|----------------------------|---------------------------------------------------------|
| `role`       | _(required)_               | Artifact filename prefix (e.g. `issues`, `project`).   |
| `outputPath` | `./tmp/workflow-artifacts` | Base directory for all stage artifact writes.           |
| `adrPath`    | `./docs/adr`               | Directory where ADR markdown files are written.         |

> **Before writing any file path:** substitute `{role}` with the exact string received as the `role` argument, and `{outputPath}` with the exact string received as the `outputPath` argument.

# ADR Stage
- Create `{adrPath}/ADR-####-<slug>.md` for each major decision.
- For high-impact decisions, invoke or follow the 'uwf-adr' skill checklist.
- Each ADR must include: context, decision, alternatives, consequences, security/ops notes, verification.
