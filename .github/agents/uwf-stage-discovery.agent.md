---
name: uwf-stage-discovery
description: "Canonical discovery stage agent. Inspects the workspace, clarifies unknowns, and produces a structured discovery artifact. No implementation."
tools: ["agent", "todo", "search", "edit", "read", "execute", "web"]
user-invokable: false
---

# Discovery Stage

Read `.github/skills/uwf-discovery/SKILL.md`. All inspection rules, the mandatory 5-step sequence, script commands, and output document structure are defined there. Follow them exactly.

## Output path

Write the discovery artifact to `outputs[0]` from the resolved context passed by the orchestrator. Do not hardcode any filename.

If `outputs` is missing or empty, fail with a clear error: `outputs[0] is required for the discovery stage but was not provided by the orchestrator.`

## Structured Context

When invoked by the orchestrator as a new-style stage (`stage_type: discovery`), the prompt includes a `behavior_policy` and `steering_policy`.

**`behavior_policy`** — shapes what you investigate and document:
- `priority_order`: address these focus areas first, in listed order
- `must_address`: these sections are **required** in the output document
- `question_policy`: `standard` = blocking unknowns only; `aggressive` = all ambiguities
- `risk_focus`: risk categories to emphasize
- `evidence_threshold`: `standard` = infer from available evidence; `high` = cite explicit sources

**`steering_policy`** — shapes verbosity and explicitness:
- `instruction_density`: `expanded`/`standard`/`compact`
- `include_examples`: if `true`, include worked examples
- `step_expansion`: if `true`, break procedural steps into numbered sub-steps
- `schema_reminders`: `exhaustive`/`standard`/`concise`
- `self_check`: if `true`, review output against `must_address` before emitting
