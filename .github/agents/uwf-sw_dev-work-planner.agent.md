---
name: uwf-sw_dev-work-planner
description: "Produce the implementation plan (`./tmp/workflow-artifacts/issues-plan.md`) for the active issue. No coding."
tools: ["agent", "todo", "search", "edit", "read", "execute"]
user-invokable: false
---
# Work Planning Stage
This stage assembles the full implementation plan from already-completed upstream artifacts. Security and tests are already defined. Do not write code or source files. Do not re-scope the issue — that is Intake's job.

## Required output: `./tmp/workflow-artifacts/issues-plan.md` (reset and scoped to this issue)

> **Order matters:** tests are written before feature code. The plan must reflect this.

### Sections (in this order)

#### 1. File / area touch list
Bullet list of every file or directory that will be created, edited, or deleted.
Separate into sub-lists: _test files_ and _implementation files_.

#### 2. Test implementation steps
Ordered steps to write the tests defined in `./tmp/workflow-artifacts/issues-test-plan.md`.
Each step: file to create/edit, test-ids being implemented, done-signal (test fails with "not implemented" or similar).

#### 3. Implementation steps
Ordered steps to make the tests pass and satisfy all acceptance criteria.
Each step must name: what changes, where (file/module/service), why, and which test-ids it satisfies.
Security controls from `./tmp/workflow-artifacts/issues-security-plan.md` must each map to at least one step here.

#### 4. Rollout plan
How the change is deployed or released. Include feature flags, phased rollout, or migration steps.

#### 5. Rollback plan
How to revert if the change causes a problem. Be specific (revert commit, flag toggle, migration down).

#### 6. Verification checklist
- [ ] All test stubs from `./tmp/workflow-artifacts/issues-test-plan.md` are covered in Test implementation steps
- [ ] All acceptance criteria from `./tmp/workflow-artifacts/issues-intake.md` map to an implementation step
- [ ] All security controls from `./tmp/workflow-artifacts/issues-security-plan.md` map to a step or test
- [ ] No files outside the touch list are modified
- [ ] Rollback path is confirmed viable
- [ ] Coverage verification command from `./tmp/workflow-artifacts/issues-test-plan.md` is included in Verification checklist

## After producing `./tmp/workflow-artifacts/issues-plan.md`
Trigger "Stage — Implementation" handoff.
