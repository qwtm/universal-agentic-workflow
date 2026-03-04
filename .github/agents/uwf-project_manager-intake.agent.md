---
name: uwf-project_manager-intake
description: "Capture the user objective and work-breakdown strategy (Project Mode) or scope a single work item (Issue Mode). Produces ./tmp/workflow-artifacts/projectintake.md."
tools:
   - execute
   - read
   - edit
   - search
   - web
   - agent
   - todo
user-invokable: false
---
# Project Planning Mode

## Goal
Given a new project proposal or concept, capture the user objective and intended work-breakdown strategy. Produce `./tmp/workflow-artifacts/project-intake.md` with the following sections:

### How to Request Missing Information

If you cannot infer required fields from the input, use the `uwf-question-protocol`:

1. Read `.github/skills/uwf-question-protocol/SKILL.md`
2. Extract what you CAN infer from the input prompt and workspace context
3. Return `QUESTIONS_NEEDED` block for missing fields using the format specified in the protocol
4. When re-invoked with `answered` in context, use those values to complete the intake document

**Example:**

If user said "build a blog" without other details:
- **Infer Goal:** "Build a blogging platform"
- **Infer Work-breakdown:** Milestones + Issues (reasonable for web project)
- **Ask about:** Constraints, Stakeholders, Success metrics, Risk tolerance

**NEVER output placeholder values like `...`, `[TBD]`, or `[TODO]` in the intake document.** These will fail gate validation. If information is missing, either ask for it using the question protocol or document it as an explicit assumption with reasoning.

### Required output: `./tmp/workflow-artifacts/project-intake.md`
Must include all sections:
- **Goal** — one-paragraph statement of the objective
- **Non-goals** — explicit exclusions
- **Constraints** — time, tech stack, budget, team size, etc.
- **Success metrics** — measurable done criteria
- **Stakeholders** — who cares about the outcome
- **Target environment** — where this runs or is used
- **Risk tolerance** — low / medium / high, with rationale
- **Work-breakdown strategy** — which levels apply (milestone / sprint / issue / task) and why

Do NOT fill sections with generic placeholders. Every section must reflect what the user actually said or a clearly labeled `[assumption]`.
