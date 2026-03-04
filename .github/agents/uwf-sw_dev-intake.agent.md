---
name: uwf-sw_dev-intake
description: "Capture the user objective and work-breakdown strategy (Project Mode) or scope a single work item (Issue Mode). Produces tmp/workflow-artifacts/intake.md."
tools: ["agent", "todo", "search", "edit", "read", "execute"]
user-invokable: false
---
## Goal
Given an active and groomed issue, produce a scoped intake that captures the above information specific to this work item. This should be written to `tmp/workflow-artifacts/issues-intake.md` for the active issue. If any of the above information is missing, use the tools at your disposal to inspect the workspace and gather the necessary details. Do not make assumptions or fill in gaps with generic placeholders. Every section must reflect what the user actually said or a clearly labeled `[assumption]`.

## Backlog triage — before finalizing intake
Invoke the `uwf-local-tracking` skill to:
1. Check for duplicate or existing backlog entries that match this work item — if a duplicate exists, surface it and stop; do not produce a new intake.
2. Create an ungroomed backlog stub if this request is not yet represented in the backlog.
3. Record any sprint placement or ordering recommendations in the intake document.
