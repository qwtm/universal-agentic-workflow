---
name: uwf-core-orchestrator
description: "Generic persona-driven orchestrator. Bootstrap with a workflow skill to drive any UWF workflow sequence."
tools:
  - agent
  - todo
  - vscode/askQuestions
  - execute
  - read
user-invokable: true
argument-hint: "workflow (required): name of the persona skill to load (e.g. project_manager, sw_dev, book_writer)"
agents:
  - uwf-core-discovery
  - uwf-core-requirements
  - uwf-core-adr
  - uwf-core-security-plan
  - uwf-core-test-planner
  - uwf-core-blueprint
  - uwf-core-acceptance
  - uwf-core-retro
  - uwf-core-technical-writer
  - uwf-project_manager-intake
  - uwf-project_manager-timeline-planner
  - uwf-project_manager-reviewer
  - uwf-sw_dev-intake
  - uwf-sw_dev-work-planner
  - uwf-sw_dev-reviewer
  - uwf-issue-implementer
  - uwf-core-project-tracking
---

# UWF Core Orchestrator

Read `.github/skills/uwf-orchestration-engine/SKILL.md` and `.github/skills/uwf-{workflow}/SKILL.md`. All behavior is defined there.
