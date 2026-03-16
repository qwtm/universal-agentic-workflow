---
name: uwf-model-adaptation
description: "Resolve the model profile and emit a structured steering policy for any UWF stage."
---

# UWF Model Adaptation Skill

## Overview

The model-adaptation skill resolves a **model profile** once at orchestrator startup and injects a
structured `steering_policy` into every stage invocation. This lets stage agents adapt their
instruction density, example verbosity, and schema-reminder frequency to the steering needs of the
running model — without requiring separate prompt files per model tier.

---

## Profiles

Three built-in profiles are defined in `profiles.yaml`:

| Profile | Use when | Instruction density | Examples | Schema reminders |
|---|---|---|---|---|
| `compact` | Smaller / instruction-following models | `expanded` | yes | `exhaustive` |
| `balanced` | Mid-tier models (default) | `standard` | no | `standard` |
| `reasoning` | Large reasoning models (o1, opus, …) | `compact` | no | `concise` |

The default profile is `balanced`. Unknown or unresolvable inputs always fall back to `balanced`.

---

## Resolution Script

```
.github/skills/uwf-model-adaptation/resolve.mjs
```

### Usage

```sh
node .github/skills/uwf-model-adaptation/resolve.mjs detect [--profile <name>] [--model <model_name>]
```

### Resolution priority

1. `--profile` flag — explicit; exits `1` if the value is unknown
2. `--model` flag — matched against `model_map` in `profiles.yaml`
3. `UWF_MODEL_PROFILE` environment variable
4. `UWF_MODEL_NAME` environment variable (matched)
5. Default: `balanced`

### Output shape

```json
{
  "profile": "balanced",
  "model_name": "claude-sonnet",
  "steering_policy": {
    "instruction_density": "standard",
    "include_examples": false,
    "step_expansion": true,
    "schema_reminders": "standard",
    "self_check": true
  }
}
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Invalid explicit profile (`--profile` was given but unknown) |
| `2` | Usage error |

---

## Steering Policy Fields

| Field | Values | Meaning |
|---|---|---|
| `instruction_density` | `expanded` \| `standard` \| `compact` | How much explanatory text to include in stage prompts |
| `include_examples` | `true` \| `false` | Whether to inline worked examples |
| `step_expansion` | `true` \| `false` | Whether to expand procedural steps into sub-bullets |
| `schema_reminders` | `exhaustive` \| `standard` \| `concise` | How verbosely to repeat output schema requirements |
| `self_check` | `true` \| `false` | Whether the agent should self-check outputs before emitting |

---

## Stage Overrides

`profiles.yaml` may define per-stage policy overrides under `stage_overrides`. These are applied
on top of the base profile steering policy by the stage-resolution layer in `stage-tracker.mjs`
when constructing the resolved stage object.

---

## Non-negotiable Rules

1. This skill is the **single source of truth** for profile definitions. Do not copy profile logic into
   individual stage agents or workflow skills.
2. Model profile must be resolved **once** at orchestrator startup, not re-resolved per stage.
3. Unknown models must silently fall back to `balanced` — never fail on an unrecognized model name.
4. Invalid explicit `--profile` values must exit `1` so the orchestrator can surface the error.
5. Do not infer the model from response quality, tool use, or conversation content.
