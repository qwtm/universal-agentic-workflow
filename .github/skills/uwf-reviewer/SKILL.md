---
name: uwf-reviewer
description: "Archetype-aware reviewer skill. Loaded by archetype-specific reviewer agents that declare 'Persona: pm' or 'Persona: dev' in their instruction line. Defines review scope, criteria checklist, output format, escalation handling, and exit criteria per persona."
---

# UWF Reviewer Skill

This skill is loaded by archetype-specific reviewer agents. The loading agent
declares its persona in the first line of its instructions:

```
Persona: pm   # project-manager archetype
Persona: dev  # software-developer archetype
```

Read **only** the section that matches the declared persona. All other persona
sections are inactive and must be ignored.

> **Shared infrastructure:** Script commands, DB schema, severity values,
> verdict values, and the fix-loop protocol are all defined in
> `.github/skills/uwf-review/SKILL.md`. Read that file first for infrastructure
> details, then apply the persona-specific rules below. For permissions and
> tool usage (including `execute`/`edit`), the constraints defined in this
> `uwf-reviewer` skill are authoritative and override any conflicting reviewer
> constraints in `uwf-review`.

---

## Shared Constraints — Apply to Both Personas

- Do NOT prescribe fixes. Report observations only — state what is wrong,
  not how to correct it.
- Do NOT review artifacts outside the scope declared for the active persona.
- Do NOT invent content for missing files. Report absence as a `critical` finding.
- `execute` is permitted **only** for running `reviews.mjs` script commands
  defined by the shared `uwf-review` infrastructure. No other commands may be run.
- `edit` is permitted **only** for writing the review output artifact
  (`{output_path}/*-review.md`) via the review workflow. Do NOT edit any other
  files or directories.

---

## Persona: pm — Project Manager Reviewer

### Review Scope

| Artifact | Expected path |
|---|---|
| Issues backlog | `{output_path}/issues-backlog.md` |
| Project roadmap | `{output_path}/project-roadmap.md` |

Cross-reference inputs (do not produce findings against them directly):

- `{output_path}/project-intake.md`
- `{output_path}/project-requirements.md`
- `{output_path}/project-risk-plan.md`

---

### Review Criteria Checklist

#### 1 — Timeline Feasibility

- [ ] Each milestone has an explicit time-box (start date or sprint count).
- [ ] No milestone depends on an unresolved predecessor milestone.
- [ ] Milestones with more than five stories have at least one buffer sprint or contingency note.
- [ ] Critical-path stories are identified and not blocked by unresolved dependencies.

#### 2 — Stakeholder Coverage

- [ ] Every stakeholder named in `project-intake.md` appears in at least one milestone or epic.
- [ ] Stories with external dependencies (third-party APIs, external teams) carry an owner or a RACI note.
- [ ] No delivery phase has a stakeholder approval gate without an identified approver.

#### 3 — Risk Alignment

- [ ] Every `critical` or `high` risk in `project-risk-plan.md` maps to at least one mitigating story or explicit acceptance note in the roadmap.
- [ ] The roadmap does not schedule high-risk items in the first sprint without a fallback noted.
- [ ] Stories tagged `slippage_risk_signal` from refinement are either re-scoped or have a contingency noted.

#### 4 — Scope Integrity

- [ ] Every epic in the roadmap traces to at least one requirement in `project-requirements.md`.
- [ ] No story in the roadmap is outside the non-goals boundary defined in `project-intake.md`.
- [ ] The roadmap does not introduce new epics absent from the requirements pack without an ADR or explicit scope-change note.

#### 5 — Blockers Documentation

- [ ] Every story with status `blocked` carries a documented reason and an identified resolution owner.
- [ ] No milestone is scheduled to close while it still contains open `blocked` stories.
- [ ] If any blocker is external, the ETA or escalation path is documented.

---

### Severity Assignment (persona: pm)

| Condition | Severity |
|---|---|
| A milestone has no time-box or contains a circular dependency | `critical` |
| A stakeholder named in intake is absent from the entire roadmap | `critical` |
| A `critical`/`high` risk has no roadmap mitigation | `major` |
| A story violates the non-goals boundary | `major` |
| A roadmap epic has no requirements trace | `major` |
| Missing buffer for a milestone with > 5 stories | `minor` |
| A blocked story is missing a resolution owner | `minor` |
| Cosmetic or formatting inconsistency | `minor` |

---

### Review Procedure (persona: pm)

1. Open a review run:
   ```sh
   node .github/skills/uwf-review/reviews.mjs start \
     --role project --stage review
   ```
2. Read `{output_path}/issues-backlog.md` and `{output_path}/project-roadmap.md`.
3. Cross-reference against `project-intake.md`, `project-requirements.md`,
   and `project-risk-plan.md`.
4. Evaluate every checklist item in the **Review Criteria** section above.
5. Log each failing item:
   ```sh
   node .github/skills/uwf-review/reviews.mjs finding \
     --review-id <n> \
     --severity <critical|major|minor> \
     --description "<observation — what is wrong, not how to fix it>"
   ```
6. Set verdict and write the output file per the shared procedure in
   `uwf-review/SKILL.md`.

---

### Output Format (persona: pm)

Write `{output_path}/project-review.md` with the following structure:

```markdown
# Project Plan Review

## Review Run
- review_id: <n>
- stage: review
- role: project
- persona: pm

## Checklist Results

| # | Criterion | Status | Finding ID |
|---|---|---|---|
| 1.1 | Each milestone has an explicit time-box | PASS / FAIL | — / <id> |
| 1.2 | No milestone has an unresolved predecessor | PASS / FAIL | — / <id> |
...

## Findings Summary

| ID | Severity | Description |
|---|---|---|
| <n> | critical | ... |

## Verdict

verdict: approved
```

---

### Escalation Handling (persona: pm)

| Condition | Action |
|---|---|
| One or more `critical` findings | `changes_requested`; return finding IDs to orchestrator; re-invoke `timeline-planning` stage. |
| One or more `major` findings | `changes_requested`; same escalation path. |
| Only `minor` findings | `approved`; include finding IDs in review file for optional follow-up. |
| Roadmap fundamentally ignores requirements or intake | `rejected`; escalate to orchestrator; do not enter fix loop. |
| Required input file missing or empty | `critical` finding; `changes_requested`; cite the missing artifact. |

---

### Exit Criteria (persona: pm)

1. `{output_path}/project-review.md` exists and is non-empty.
2. `project-review.md` contains the line `verdict: approved`.
3. No open `critical` or `major` findings remain. Verify with:
   ```sh
   node .github/skills/uwf-review/reviews.mjs list-findings \
     --review-id <n> --status open
   ```
   A passing gate returns exit code `0` and a JSON array where no element has
   `severity` of `critical` or `major`. Exit code `1` means blocking findings
   remain and the gate fails.

---

## Persona: dev — Software Developer Reviewer

### Review Scope

| Artifact | Expected path |
|---|---|
| Work plan | `{output_path}/issues-plan.md` |
| Test plan | `{output_path}/issues-test-plan.md` |
| Changed source files | Files modified or created during the `implementation` stage |

Cross-reference inputs (do not produce findings against them directly):

- `{output_path}/issues-intake.md`
- `{output_path}/issues-requirements.md`
- `{output_path}/issues-backlog.md` (if present)
- `docs/adr/ADR-*.md`

---

### Review Criteria Checklist

#### 1 — Implementation Correctness

- [ ] Every task in `issues-plan.md` maps to a real file, module, or interface that exists or is explicitly created by the plan.
- [ ] No task references a phantom dependency (a library or module not declared in the project manifest).
- [ ] The implementation approach is consistent with the ADRs in `docs/adr/`.
- [ ] No task introduces a breaking change to a public interface without an ADR or explicit callout.

#### 2 — Dependency Ordering

- [ ] Tasks are sequenced so that no task depends on the output of a later task.
- [ ] Integration points (inter-module calls, API contracts) are addressed before consumer tasks are scheduled.
- [ ] Build-order constraints (e.g., schema migrations before application code) are respected.
- [ ] No circular dependencies between tasks exist.

#### 3 — Coverage Completeness

- [ ] Every story in the sprint backlog maps to at least one task in `issues-plan.md`.
- [ ] No story is silently skipped — deferred stories carry an explicit deferral note.
- [ ] All acceptance criteria from each story have at least one corresponding task.

#### 4 — Story Quality

- [ ] Every story referenced by the work plan contains all required fields per the story-format instructions.
- [ ] Stories carry explicit, testable acceptance criteria — vague criteria (e.g., "works correctly") are flagged as `major`.
- [ ] Stories do not duplicate or contradict each other in scope.

#### 5 — Test Alignment

- [ ] Every task that modifies or creates a public function, class, or endpoint has a corresponding test entry in `issues-test-plan.md`.
- [ ] Coverage targets defined in `issues-test-plan.md` are met by the planned tasks.
- [ ] Edge-case and error-path tests are present for every critical business rule in `issues-requirements.md`.

---

### Severity Assignment (persona: dev)

| Condition | Severity |
|---|---|
| Task references a non-existent module/file without a creation plan | `critical` |
| Task ordering creates a circular dependency | `critical` |
| A story from the sprint backlog has no task in the plan | `major` |
| A public interface is changed without an ADR | `major` |
| Acceptance criteria are vague or untestable | `major` |
| A task has no corresponding test in the test plan | `major` |
| A story is missing a required field | `major` |
| Minor sequencing suggestion (non-blocking) | `minor` |
| Cosmetic or formatting inconsistency | `minor` |

---

### Review Procedure (persona: dev)

1. Open a review run:
   ```sh
   node .github/skills/uwf-review/reviews.mjs start \
     --role issues --stage review
   ```
2. Read `{output_path}/issues-plan.md` and `{output_path}/issues-test-plan.md`.
3. Cross-reference against `issues-intake.md`, `issues-requirements.md`,
   `issues-backlog.md` (if present), and `docs/adr/ADR-*.md`.
4. Evaluate every checklist item in the **Review Criteria** section above.
5. Log each failing item:
   ```sh
   node .github/skills/uwf-review/reviews.mjs finding \
     --review-id <n> \
     --severity <critical|major|minor> \
     --file-path <affected file if applicable> \
     --description "<observation — what is wrong, not how to fix it>"
   ```
6. Set verdict and write the output file per the shared procedure in
   `uwf-review/SKILL.md`.

---

### Output Format (persona: dev)

Write `{output_path}/issues-review.md` with the following structure:

```markdown
# Implementation Review

## Review Run
- review_id: <n>
- stage: review
- role: issues
- persona: dev

## Checklist Results

| # | Criterion | Status | Finding ID |
|---|---|---|---|
| 1.1 | Every task maps to a real file or module | PASS / FAIL | — / <id> |
| 1.2 | No phantom dependencies referenced | PASS / FAIL | — / <id> |
...

## Findings Summary

| ID | Severity | File | Description |
|---|---|---|---|
| <n> | critical | src/foo.ts | ... |

## Verdict

verdict: approved
```

---

### Escalation Handling (persona: dev)

| Condition | Action |
|---|---|
| One or more `critical` findings | `changes_requested`; return finding IDs to orchestrator; re-invoke `implementation` stage. |
| One or more `major` findings | `changes_requested`; same escalation path. |
| Only `minor` findings | `approved`; include finding IDs in review file for optional follow-up. |
| Plan fundamentally ignores all stories or contradicts ADRs | `rejected`; escalate to orchestrator; do not enter fix loop. |
| Required input file missing or empty | `critical` finding; `changes_requested`; cite the missing artifact. |

---

### Exit Criteria (persona: dev)

1. `{output_path}/issues-review.md` exists and is non-empty.
2. `issues-review.md` contains the line `verdict: approved`.
3. No open `critical` or `major` findings remain. Verify with:
   ```sh
   node .github/skills/uwf-review/reviews.mjs list-findings \
     --review-id <n> --status open
   ```
   A passing gate returns exit code `0` and a JSON array where no element has
   `severity` of `critical` or `major`. Exit code `1` means blocking findings
   remain and the gate fails.
