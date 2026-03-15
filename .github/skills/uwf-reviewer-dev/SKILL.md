---
name: uwf-reviewer-dev
description: "Dev-archetype reviewer skill. Defines scope, criteria, output format, escalation handling, and exit criteria for reviewing software-developer implementation artifacts."
---

# UWF Reviewer — Software Developer Archetype

This skill is loaded exclusively by the `uwf-sw_dev-reviewer` agent.
It supplements the shared review infrastructure in `.github/skills/uwf-review/SKILL.md`
with Dev-specific scope, checklist, and escalation rules.

> **All script commands, DB schema, severity guide, and fix-loop protocol are
> inherited from `uwf-review/SKILL.md`. Read that file first, then apply the
> Dev-specific rules below.**

---

## Review Scope

The Dev reviewer is responsible for the following artifacts only:

| Artifact | Expected path |
|---|---|
| Work plan | `{output_path}/issues-plan.md` |
| Test plan | `{output_path}/issues-test-plan.md` |
| Changed source files | Files modified or created during the `implementation` stage |

Do NOT review project roadmaps, stakeholder maps, or any artifact outside this scope.

---

## Review Criteria Checklist

Evaluate every item below. Log a finding for every item that is not fully satisfied.

### 1 — Implementation Correctness

- [ ] Every task in `issues-plan.md` maps to a real file, module, or interface that exists or is explicitly created by the plan.
- [ ] No task references a phantom dependency (a library or module not declared in the project manifest).
- [ ] The implementation approach described in the plan is consistent with the ADRs in `docs/adr/`.
- [ ] No task introduces a breaking change to a public interface without an ADR or explicit callout.

### 2 — Dependency Ordering

- [ ] Tasks in the work plan are sequenced so that no task depends on the output of a later task.
- [ ] Integration points (inter-module calls, API contracts) are addressed before the consumer task is scheduled.
- [ ] Build-order constraints (e.g., schema migrations before application code) are respected.
- [ ] Circular dependencies between tasks are absent.

### 3 — Coverage Completeness

- [ ] Every story in the sprint backlog (`issues-backlog.md`) maps to at least one task in `issues-plan.md`.
- [ ] No story is silently skipped. If a story is deferred, the plan carries an explicit deferral note.
- [ ] All acceptance criteria from each story have at least one corresponding task.

### 4 — Story Quality

- [ ] Every story referenced by the work plan contains all required fields as defined in the story-format instructions.
- [ ] Stories carry explicit, testable acceptance criteria — vague criteria (e.g., "works correctly") are flagged as `major`.
- [ ] Stories do not duplicate or contradict each other in scope.
- [ ] Story estimates (if present) are not obviously inconsistent with the task list.

### 5 — Test Alignment

- [ ] Every task that modifies or creates a public function, class, or endpoint has a corresponding test entry in `issues-test-plan.md`.
- [ ] Test coverage targets defined in `issues-test-plan.md` are met by the planned tasks.
- [ ] No task is marked "done" in the plan without a corresponding test being green (or explicitly noted as manual/deferred with rationale).
- [ ] Edge-case and error-path tests are present for every critical business rule identified in `issues-requirements.md`.

---

## Severity Assignment

Apply the following rules when assigning finding severity:

| Condition | Severity |
|---|---|
| Task references a non-existent module/file without a creation plan | `critical` |
| Task ordering creates a circular dependency | `critical` |
| A story from the sprint backlog has no task in the plan | `major` |
| A public interface is changed without an ADR | `major` |
| Acceptance criteria for a story are vague or untestable | `major` |
| A task has no corresponding test in the test plan | `major` |
| Story missing a required field (per story-format instructions) | `major` |
| Minor sequencing preference (non-blocking reordering suggestion) | `minor` |
| Cosmetic or formatting inconsistency | `minor` |

---

## Review Procedure

1. Open a review run:
   ```sh
   node .github/skills/uwf-review/reviews.mjs start \
     --role issues --stage review
   ```
2. Read `{output_path}/issues-plan.md` and `{output_path}/issues-test-plan.md`.
3. Cross-reference against `{output_path}/issues-intake.md`,
   `{output_path}/issues-requirements.md`, `{output_path}/issues-backlog.md` (if present),
   and `docs/adr/ADR-*.md`.
4. Evaluate every checklist item under **Review Criteria** above.
5. Log each failing item as a finding:
   ```sh
   node .github/skills/uwf-review/reviews.mjs finding \
     --review-id <n> \
     --severity <critical|major|minor> \
     --file-path <affected file if applicable> \
     --description "<observation — what is wrong, not how to fix it>"
   ```
6. Set verdict and write the output file per the shared review procedure in
   `uwf-review/SKILL.md`.

---

## Output Format

The reviewer writes `{output_path}/issues-review.md`.
The file MUST include the following sections:

```markdown
# Implementation Review

## Review Run
- review_id: <n>
- stage: review
- role: issues

## Checklist Results

| # | Criterion | Status | Finding ID |
|---|---|---|---|
| 1.1 | Every task maps to a real file or module | PASS / FAIL | — / <id> |
...

## Findings Summary

| ID | Severity | File | Description |
|---|---|---|---|
| <n> | critical | src/foo.ts | ... |

## Verdict

verdict: approved
```

The `verdict:` line MUST be present and MUST be one of:
`approved` · `changes_requested` · `rejected`

---

## Escalation Handling

| Condition | Action |
|---|---|
| One or more `critical` findings | Set verdict `changes_requested`; return finding IDs to orchestrator for re-invocation of `implementation` stage. |
| One or more `major` findings | Set verdict `changes_requested`; same escalation path. |
| Only `minor` findings | Set verdict `approved`; include finding IDs in review file for optional follow-up. |
| Fundamental approach problem (e.g., plan ignores all stories or contradicts ADRs) | Set verdict `rejected`; escalate to orchestrator immediately — do not enter the fix loop. |
| Required input file missing or empty | Log as `critical` finding; set verdict `changes_requested`; cite the missing artifact. |

The reviewer MUST NOT prescribe fixes. Report observations only.

---

## Exit Criteria

The review stage gate passes when ALL of the following are true:

1. `{output_path}/issues-review.md` exists and is non-empty.
2. `issues-review.md` contains the line `verdict: approved`.
3. No open `critical` or `major` findings remain in the review DB
   (gate check: `node .github/skills/uwf-review/reviews.mjs list-findings --review-id <n> --status open`
   exits `0` — i.e., no open critical/major findings).

---

## Hard Constraints — Never Violate

- Do NOT use `edit` or `execute` tools. This reviewer is **read-only**.
- Do NOT prescribe implementation details in findings. Report the gap only.
- Do NOT review artifacts outside the declared scope for this stage.
- Do NOT invent content for missing files. Report absence as a finding.
