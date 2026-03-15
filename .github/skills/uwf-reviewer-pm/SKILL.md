---
name: uwf-reviewer-pm
description: "PM-archetype reviewer skill. Defines scope, criteria, output format, escalation handling, and exit criteria for reviewing project-manager planning artifacts."
---

# UWF Reviewer — Project Manager Archetype

This skill is loaded exclusively by the `uwf-project_manager-reviewer` agent.
It supplements the shared review infrastructure in `.github/skills/uwf-review/SKILL.md`
with PM-specific scope, checklist, and escalation rules.

> **All script commands, DB schema, severity guide, and fix-loop protocol are
> inherited from `uwf-review/SKILL.md`. Read that file first, then apply the
> PM-specific rules below.**

---

## Review Scope

The PM reviewer is responsible for the following artifacts only:

| Artifact | Expected path |
|---|---|
| Issues backlog | `{output_path}/issues-backlog.md` |
| Project roadmap | `{output_path}/project-roadmap.md` |

Do NOT review implementation code, test files, or any artifact outside this scope.

---

## Review Criteria Checklist

Evaluate every item below. Log a finding for every item that is not fully satisfied.

### 1 — Timeline Feasibility

- [ ] Each milestone has an explicit time-box (start date or sprint count).
- [ ] No milestone depends on an unresolved predecessor milestone.
- [ ] Milestones with more than five stories have at least one buffer sprint or contingency note.
- [ ] Critical-path stories are identified and not blocked by unresolved dependencies.

### 2 — Stakeholder Coverage

- [ ] Every stakeholder named in `project-intake.md` appears in at least one milestone or epic.
- [ ] Stories with external dependencies (third-party APIs, external teams) carry an owner or a RACI note.
- [ ] No delivery phase has a stakeholder approval gate without an identified approver.

### 3 — Risk Alignment

- [ ] Every `critical` or `high` risk in `project-risk-plan.md` maps to at least one mitigating story or explicit acceptance note in the roadmap.
- [ ] The roadmap does not schedule high-risk items in the first sprint without a fallback noted.
- [ ] Stories tagged `slippage_risk_signal` from refinement are either re-scoped or have a contingency noted.

### 4 — Scope Integrity

- [ ] Every epic in the roadmap traces to at least one requirement in `project-requirements.md`.
- [ ] No story in the roadmap is outside the non-goals boundary defined in `project-intake.md`.
- [ ] The roadmap does not introduce new epics or capabilities absent from the requirements pack without an ADR or explicit scope-change note.

### 5 — Blockers Documentation

- [ ] Every story with status `blocked` carries a documented reason and an identified resolution owner.
- [ ] No milestone is scheduled to close while it still contains open `blocked` stories.
- [ ] If any blocker is external, the ETA or escalation path is documented.

---

## Severity Assignment

Apply the following rules when assigning finding severity:

| Condition | Severity |
|---|---|
| A milestone contains no time-box or has circular dependency | `critical` |
| A stakeholder named in intake is absent from the entire roadmap | `critical` |
| A `critical`/`high` risk has no roadmap mitigation | `major` |
| A story is out of scope (violates non-goals) | `major` |
| A roadmap epic has no requirements trace | `major` |
| Missing buffer for a milestone with > 5 stories | `minor` |
| Blocked story is missing resolution owner | `minor` |
| Cosmetic or formatting inconsistency | `minor` |

---

## Review Procedure

1. Open a review run:
   ```sh
   node .github/skills/uwf-review/reviews.mjs start \
     --role project --stage review
   ```
2. Read `{output_path}/issues-backlog.md` and `{output_path}/project-roadmap.md`.
3. Cross-reference against `{output_path}/project-intake.md`,
   `{output_path}/project-requirements.md`, and `{output_path}/project-risk-plan.md`.
4. Evaluate every checklist item under **Review Criteria** above.
5. Log each failing item as a finding:
   ```sh
   node .github/skills/uwf-review/reviews.mjs finding \
     --review-id <n> \
     --severity <critical|major|minor> \
     --description "<observation — what is wrong, not how to fix it>"
   ```
6. Set verdict and write the output file per the shared review procedure in
   `uwf-review/SKILL.md`.

---

## Output Format

The reviewer writes `{output_path}/project-review.md`.
The file MUST include the following sections:

```markdown
# Project Plan Review

## Review Run
- review_id: <n>
- stage: review
- role: project

## Checklist Results

| # | Criterion | Status | Finding ID |
|---|---|---|---|
| 1.1 | Each milestone has an explicit time-box | PASS / FAIL | — / <id> |
...

## Findings Summary

| ID | Severity | Description |
|---|---|---|
| <n> | critical | ... |

## Verdict

verdict: approved
```

The `verdict:` line MUST be present and MUST be one of:
`approved` · `changes_requested` · `rejected`

---

## Escalation Handling

| Condition | Action |
|---|---|
| One or more `critical` findings | Set verdict `changes_requested`; return finding IDs to orchestrator for re-invocation of `timeline-planning` stage. |
| One or more `major` findings | Set verdict `changes_requested`; same escalation path. |
| Only `minor` findings | Set verdict `approved`; include finding IDs in review file for optional follow-up. |
| Fundamental scope or approach problem (e.g., roadmap ignores all requirements) | Set verdict `rejected`; escalate to orchestrator immediately — do not attempt a fix loop. |
| Required input file missing or empty | Log as `critical` finding; set verdict `changes_requested`; cite the missing artifact. |

The reviewer MUST NOT prescribe fixes. Report observations only.

---

## Exit Criteria

The review stage gate passes when ALL of the following are true:

1. `{output_path}/project-review.md` exists and is non-empty.
2. `project-review.md` contains the line `verdict: approved`.
3. No open `critical` or `major` findings remain in the review DB
   (gate check: `node .github/skills/uwf-review/reviews.mjs list-findings --review-id <n> --status open`
   exits `0` — i.e., no open critical/major findings).

---

## Hard Constraints — Never Violate

- Do NOT use `edit` or `execute` tools. This reviewer is **read-only**.
- Do NOT prescribe implementation details in findings. Report the gap only.
- Do NOT review artifacts outside the declared scope for this stage.
- Do NOT invent content for missing files. Report absence as a finding.
