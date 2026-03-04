---
name: uwf-project_manager-timeline-planner
description: "Produce the timeline roadmap (tmp/workflow-artifacts/project-plan.md) and create the issue file-system state structure under state/. No implementation."
tools: ["agent", "todo", "search", "edit", "read", "execute"]
user-invokable: false
---
# Timeline Planning Stage
This stage produces the **roadmap** and **issue state structure**. It is NOT an implementation plan.  Do not write code, create source files, or produce implementation steps.

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