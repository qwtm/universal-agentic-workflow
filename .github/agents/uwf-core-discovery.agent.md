---
name: uwf-core-discovery
description: "Inspect the workspace, clarify unknowns, and update intake. No implementation."
tools: ["agent", "todo", "search", "edit", "read", "execute", "web"]
user-invokable: false
---

# Discovery Stage

Read `.github/skills/uwf-discovery/SKILL.md`. All inspection rules, the mandatory 5-step sequence, script commands, and output document structure are defined there. Follow them exactly.

## Structured Context

When invoked by the orchestrator as a new-style stage (`stage_type: discovery`), the prompt will
include a `behavior_policy` and `steering_policy` in the context block. Use these as follows:

**`behavior_policy`** — shapes what you investigate and document:
- `priority_order`: address these focus areas first, in listed order
- `must_address`: these sections are **required** in the output document; do not omit any
- `question_policy`: `standard` = ask only blocking unknowns; `aggressive` = proactively surface all ambiguities
- `risk_focus`: risk categories to emphasize in the risk section
- `evidence_threshold`: `standard` = infer from available evidence; `high` = cite explicit sources for every claim

**`steering_policy`** — shapes how verbose and explicit to be:
- `instruction_density`: `expanded` = include sub-explanations; `standard` = normal prose; `compact` = concise bullets
- `include_examples`: if `true`, include a worked example for each section header
- `step_expansion`: if `true`, break procedural steps into numbered sub-steps
- `schema_reminders`: `exhaustive` = repeat output schema for every section; `standard` = once at the top; `concise` = omit
- `self_check`: if `true`, review your output against `must_address` before emitting it

When no `behavior_policy` or `steering_policy` is present in the context (legacy invocations),
use the defaults from `.github/skills/uwf-discovery/SKILL.md`.

