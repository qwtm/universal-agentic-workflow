# uwf-br — Build Record

## Overview

`uwf-br` is the **agent-replayable layered execution log** for a UWF workflow run. Every stage appends to it; nothing is ever overwritten or deleted. Given only the contents of `uwf-br`, a cold-starting AI agent can understand:

- **Why** this system exists (Layer 0: Context)
- **What** was decided and why (Layer 1: Decisions)
- **What** depends on what (Layer 2: Dependencies)
- **What** actions were taken and in what order (Layer 3: Actions)
- **How** to verify correctness at each layer (Layer 4: Verification)
- **What** the current state is (Layer 5: State)

## Storage Format

`uwf-br` is stored as **SQLite** with one table per layer. The database is located at:

```
.github/skills/uwf-cbs/uwf-br.db
```

At the `snapshot` stage, a full JSON export is produced as `uwf-drs` — the portable, point-in-time snapshot of `uwf-br` at the moment of acceptance. See [JSON Export Schema](#json-export-schema-for-uwf-drs) below.

---

## Append-Only Constraint

`uwf-br` is **append-only**. No row may ever be updated or deleted after it is written. Enforce this at the application layer:

- `INSERT` only — `UPDATE` and `DELETE` operations are forbidden.
- Agents that need to change a prior record must instead insert a new entry referencing the superseded `entry_id` and explaining the correction.
- SQLite triggers may be used to enforce this constraint; the DDL for each table includes an optional trigger definition.

This constraint is what makes `uwf-br` replayable: you can replay entries in `recorded_at` order and reconstruct the exact state of the system at any point in the workflow run.

---

## Confidence Tier Enum

The `confidence` field is used on all layers. It expresses how certain the writing stage is about the entry's content.

| Value | Meaning | Scoring Rule |
|---|---|---|
| `confirmed` | Directly evidenced by a source document, test result, stakeholder confirmation, or code inspection. No inference required. | Score: 1.0 |
| `inferred-strong` | Not directly stated, but strongly implied by two or more independent sources. High confidence in correctness. | Score: 0.7–0.9 |
| `inferred-weak` | Inferred from a single source or from indirect evidence. Plausible but not verified. | Score: 0.4–0.6 |
| `gap` | Required information is absent. Entry records the gap itself, not a resolution. No claim of correctness. | Score: 0.0–0.3 |

**Rules:**
1. Always use the most conservative tier that honestly reflects the evidence available.
2. An entry with `confidence = gap` must set its `content` (or equivalent field) to a description of what is missing and why it matters.
3. When a gap is later resolved, append a new entry superseding the gap entry — do not update or delete the original.

---

## Layer 0 — Context

### Purpose

Records the raw problem context for the workflow run: what exists, what is unknown, what is assumed, and what needs answering. This is the foundation from which all subsequent decisions and actions are derived.

### Owning Stage(s)

| Stage | Agent |
|---|---|
| `discovery` | `uwf-core-discovery.agent.md` |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `CTX-NNNN` (e.g., `CTX-0001`) |
| `stage` | `TEXT` | Yes | Always `"discovery"` |
| `type` | `TEXT` | Yes | `problem_statement` \| `constraint` \| `assumption` \| `open_question` |
| `content` | `TEXT` | Yes | Full text of the context entry |
| `source` | `TEXT` | Yes | Citation: document name, conversation reference, or stakeholder name |
| `confidence` | `TEXT` | Yes | Confidence tier (see [Confidence Tier Enum](#confidence-tier-enum)) |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_0_context (
  entry_id    TEXT    NOT NULL PRIMARY KEY
                      CHECK(entry_id GLOB 'CTX-[0-9][0-9][0-9][0-9]*'),
  stage       TEXT    NOT NULL DEFAULT 'discovery',
  type        TEXT    NOT NULL CHECK(type IN (
                'problem_statement', 'constraint',
                'assumption', 'open_question')),
  content     TEXT    NOT NULL,
  source      TEXT    NOT NULL,
  confidence  TEXT    NOT NULL CHECK(confidence IN (
                'confirmed', 'inferred-strong',
                'inferred-weak', 'gap')),
  recorded_at TEXT    NOT NULL
);

-- Enforce append-only: prevent UPDATE and DELETE
CREATE TRIGGER IF NOT EXISTS layer_0_no_update
  BEFORE UPDATE ON layer_0_context
BEGIN
  SELECT RAISE(ABORT, 'layer_0_context is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_0_no_delete
  BEFORE DELETE ON layer_0_context
BEGIN
  SELECT RAISE(ABORT, 'layer_0_context is append-only: DELETE is forbidden');
END;
```

### Example Entry

```json
{
  "entry_id":    "CTX-0001",
  "stage":       "discovery",
  "type":        "problem_statement",
  "content":     "The authentication service has no rate-limiting on the /login endpoint, creating a brute-force attack surface.",
  "source":      "discovery — codebase inspection of api/auth/login.ts",
  "confidence":  "confirmed",
  "recorded_at": "2025-06-01T09:14:00Z"
}
```

---

## Layer 1 — Decisions

### Purpose

Records every decision made during the workflow run: architectural decisions, requirements, risk register entries, and security constraints. Each entry explains the decision, why it was chosen over alternatives, and what downstream constraints it creates.

### Owning Stage(s)

| Stage | Agent | Entry Types Written |
|---|---|---|
| `requirements` | `uwf-core-requirements.agent.md` | `requirement` |
| `adr` | `uwf-core-adr.agent.md` | `adr` |
| `risk-planner` | `uwf-core-risk-planner.agent.md` | `risk` |
| `security-planner` | `uwf-core-security-plan.agent.md` | `security-constraint` |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `DEC-NNNN` (e.g., `DEC-0001`) |
| `stage` | `TEXT` | Yes | Source stage name |
| `type` | `TEXT` | Yes | `requirement` \| `adr` \| `risk` \| `security-constraint` |
| `title` | `TEXT` | Yes | Concise, verb-first title (e.g., "Use JWT for stateless authentication") |
| `rationale` | `TEXT` | Yes | Why this decision was made and not an alternative |
| `alternatives_rejected` | `TEXT` | No | JSON array of objects `{"option": "...", "reason": "..."}` |
| `content` | `TEXT` | Yes | Full decision text |
| `constraints_imposed` | `TEXT` | No | JSON array of strings describing downstream constraints this creates |
| `confidence` | `TEXT` | Yes | Confidence tier |
| `source` | `TEXT` | Yes | Citation: ADR file path, requirement ID, stakeholder, or document |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_1_decisions (
  entry_id             TEXT    NOT NULL PRIMARY KEY
                               CHECK(entry_id GLOB 'DEC-[0-9][0-9][0-9][0-9]*'),
  stage                TEXT    NOT NULL,
  type                 TEXT    NOT NULL CHECK(type IN (
                         'requirement', 'adr',
                         'risk', 'security-constraint')),
  title                TEXT    NOT NULL,
  rationale            TEXT    NOT NULL,
  alternatives_rejected TEXT,
  content              TEXT    NOT NULL,
  constraints_imposed  TEXT,
  confidence           TEXT    NOT NULL CHECK(confidence IN (
                         'confirmed', 'inferred-strong',
                         'inferred-weak', 'gap')),
  source               TEXT    NOT NULL,
  recorded_at          TEXT    NOT NULL
);

-- Enforce append-only
CREATE TRIGGER IF NOT EXISTS layer_1_no_update
  BEFORE UPDATE ON layer_1_decisions
BEGIN
  SELECT RAISE(ABORT, 'layer_1_decisions is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_1_no_delete
  BEFORE DELETE ON layer_1_decisions
BEGIN
  SELECT RAISE(ABORT, 'layer_1_decisions is append-only: DELETE is forbidden');
END;
```

### Example Entry

```json
{
  "entry_id":    "DEC-0001",
  "stage":       "adr",
  "type":        "adr",
  "title":       "Use JWT for stateless authentication tokens",
  "rationale":   "JWT allows the API gateway to validate tokens without a database lookup, reducing latency and eliminating a distributed state dependency.",
  "alternatives_rejected": [
    {"option": "Opaque session tokens in Redis", "reason": "Requires Redis as a hard dependency; adds operational complexity and a network hop on every request."},
    {"option": "PASETO v2", "reason": "Better security properties than JWT but library ecosystem is immature for our runtime; deferred to a future ADR."}
  ],
  "content":     "All API endpoints requiring authentication will accept a Bearer JWT signed with RS256. Tokens must expire within 24 hours. Refresh tokens are out of scope for this iteration.",
  "constraints_imposed": [
    "All services that verify tokens must be provisioned with the public key.",
    "Token max TTL of 24 hours must be enforced at issuance (see security-constraint DEC-0004)."
  ],
  "confidence":  "confirmed",
  "source":      "docs/adr/ADR-0001-authentication-strategy.md",
  "recorded_at": "2025-06-02T11:30:00Z"
}
```

---

## Layer 2 — Dependencies

### Purpose

Records every dependency between components, services, or external systems. Distinguishes between hard build-order dependencies, soft preferences, and external third-party dependencies. Blocking risks from the risk register are also flagged here.

### Owning Stage(s)

| Stage | Agent | Entry Types Written |
|---|---|---|
| `risk-planner` | `uwf-core-risk-planner.agent.md` | Blocking dependency risks |
| `blueprint` | `uwf-core-blueprint.agent.md` | All component dependencies |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `DEP-NNNN` (e.g., `DEP-0001`) |
| `from` | `TEXT` | Yes | ID or name of the component or service that has the dependency |
| `blocked_by` | `TEXT` | Yes | ID or name of the component, service, or external dependency it depends on |
| `dependency_type` | `TEXT` | Yes | `hard` \| `soft` \| `external` |
| `owner` | `TEXT` | Yes | Role or team responsible for resolving this dependency |
| `status` | `TEXT` | Yes | `open` \| `resolved` \| `accepted-risk` |
| `risk_ref` | `TEXT` | No | Reference to a Layer 1 risk entry (e.g., `DEC-0007`) if this dependency carries a risk |
| `confidence` | `TEXT` | Yes | Confidence tier |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

**`dependency_type` values:**
- `hard` — `from` cannot function without `blocked_by` being present and operational
- `soft` — `from` degrades but does not fail without `blocked_by`
- `external` — `blocked_by` is a third-party service, library, or system outside the project's control

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_2_dependencies (
  entry_id        TEXT    NOT NULL PRIMARY KEY
                          CHECK(entry_id GLOB 'DEP-[0-9][0-9][0-9][0-9]*'),
  from_component  TEXT    NOT NULL,
  blocked_by      TEXT    NOT NULL,
  dependency_type TEXT    NOT NULL CHECK(dependency_type IN (
                    'hard', 'soft', 'external')),
  owner           TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK(status IN (
                    'open', 'resolved', 'accepted-risk')),
  risk_ref        TEXT,
  confidence      TEXT    NOT NULL CHECK(confidence IN (
                    'confirmed', 'inferred-strong',
                    'inferred-weak', 'gap')),
  recorded_at     TEXT    NOT NULL
);

-- Enforce append-only
CREATE TRIGGER IF NOT EXISTS layer_2_no_update
  BEFORE UPDATE ON layer_2_dependencies
BEGIN
  SELECT RAISE(ABORT, 'layer_2_dependencies is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_2_no_delete
  BEFORE DELETE ON layer_2_dependencies
BEGIN
  SELECT RAISE(ABORT, 'layer_2_dependencies is append-only: DELETE is forbidden');
END;
```

> **Note:** The column is named `from_component` in SQL to avoid collision with the reserved keyword `FROM`. In JSON exports and documentation it is referred to as `from`.

### Example Entry

```json
{
  "entry_id":       "DEP-0001",
  "from":           "api.user-service",
  "blocked_by":     "api.auth-service",
  "dependency_type": "hard",
  "owner":          "backend-team",
  "status":         "open",
  "risk_ref":       null,
  "confidence":     "confirmed",
  "recorded_at":    "2025-06-03T08:00:00Z"
}
```

---

## Layer 3 — Actions

### Purpose

Records every action that must be (or was) taken during the workflow run: implementation tasks, configuration changes, migrations, tests, and reviews. Each entry specifies preconditions and postconditions so that agents can verify the action is safe to execute and that it completed correctly.

### Owning Stage(s)

| Stage | Agent | Entry Types Written |
|---|---|---|
| `work-planner` | `uwf-sw_dev-work-planner.agent.md` | `implement`, `configure`, `migrate`, `test` |
| `refinement` | `uwf-core-refinement.agent.md` | `review` |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `ACT-NNNN` (e.g., `ACT-0001`) |
| `stage` | `TEXT` | Yes | Source stage name |
| `story_ref` | `TEXT` | No | US-* story reference (e.g., `US-0003`) |
| `action_type` | `TEXT` | Yes | `implement` \| `configure` \| `migrate` \| `test` \| `review` |
| `preconditions` | `TEXT` | Yes | JSON array of strings — what must be true before this action can execute |
| `postconditions` | `TEXT` | Yes | JSON array of strings — what must be true after this action completes |
| `reversible` | `INTEGER` | Yes | `1` (true) or `0` (false) — whether this action can be undone |
| `reversal_cost` | `TEXT` | Yes | `none` \| `low` \| `high` \| `irreversible` |
| `confidence` | `TEXT` | Yes | Confidence tier |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_3_actions (
  entry_id       TEXT     NOT NULL PRIMARY KEY
                          CHECK(entry_id GLOB 'ACT-[0-9][0-9][0-9][0-9]*'),
  stage          TEXT     NOT NULL,
  story_ref      TEXT,
  action_type    TEXT     NOT NULL CHECK(action_type IN (
                   'implement', 'configure',
                   'migrate', 'test', 'review')),
  preconditions  TEXT     NOT NULL,
  postconditions TEXT     NOT NULL,
  reversible     INTEGER  NOT NULL CHECK(reversible IN (0, 1)),
  reversal_cost  TEXT     NOT NULL CHECK(reversal_cost IN (
                   'none', 'low', 'high', 'irreversible')),
  confidence     TEXT     NOT NULL CHECK(confidence IN (
                   'confirmed', 'inferred-strong',
                   'inferred-weak', 'gap')),
  recorded_at    TEXT     NOT NULL
);

-- Enforce append-only
CREATE TRIGGER IF NOT EXISTS layer_3_no_update
  BEFORE UPDATE ON layer_3_actions
BEGIN
  SELECT RAISE(ABORT, 'layer_3_actions is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_3_no_delete
  BEFORE DELETE ON layer_3_actions
BEGIN
  SELECT RAISE(ABORT, 'layer_3_actions is append-only: DELETE is forbidden');
END;
```

### Example Entry

```json
{
  "entry_id":      "ACT-0001",
  "stage":         "work-planner",
  "story_ref":     "US-0003",
  "action_type":   "implement",
  "preconditions": [
    "api.auth-service is deployed and reachable",
    "JWT public key is provisioned to api.user-service"
  ],
  "postconditions": [
    "api.user-service /profile endpoint returns 401 for unauthenticated requests",
    "api.user-service /profile endpoint returns 200 with user data for valid JWT"
  ],
  "reversible":    true,
  "reversal_cost": "low",
  "confidence":    "confirmed",
  "recorded_at":   "2025-06-04T14:22:00Z"
}
```

---

## Layer 4 — Verification

### Purpose

Records every verification criterion: unit tests, integration tests, end-to-end tests, acceptance checks, and manual verifications. Each entry specifies binary, testable conditions and tracks whether they passed.

### Owning Stage(s)

| Stage | Agent | Entry Types Written |
|---|---|---|
| `test-planner` | `uwf-core-test-planner.agent.md` | `unit`, `integration`, `e2e`, `manual` |
| `acceptance` | `uwf-core-acceptance.agent.md` | `acceptance` |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `VER-NNNN` (e.g., `VER-0001`) |
| `stage` | `TEXT` | Yes | Source stage name |
| `story_ref` | `TEXT` | No | US-* story reference (if applicable) |
| `verification_type` | `TEXT` | Yes | `unit` \| `integration` \| `e2e` \| `acceptance` \| `manual` |
| `criteria` | `TEXT` | Yes | JSON array of strings — binary testable conditions (each must be independently verifiable) |
| `result` | `TEXT` | Yes | `pass` \| `fail` \| `pending` |
| `confidence` | `TEXT` | Yes | Confidence tier |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_4_verification (
  entry_id          TEXT    NOT NULL PRIMARY KEY
                            CHECK(entry_id GLOB 'VER-[0-9][0-9][0-9][0-9]*'),
  stage             TEXT    NOT NULL,
  story_ref         TEXT,
  verification_type TEXT    NOT NULL CHECK(verification_type IN (
                      'unit', 'integration', 'e2e',
                      'acceptance', 'manual')),
  criteria          TEXT    NOT NULL,
  result            TEXT    NOT NULL CHECK(result IN (
                      'pass', 'fail', 'pending')),
  confidence        TEXT    NOT NULL CHECK(confidence IN (
                      'confirmed', 'inferred-strong',
                      'inferred-weak', 'gap')),
  recorded_at       TEXT    NOT NULL
);

-- Enforce append-only
CREATE TRIGGER IF NOT EXISTS layer_4_no_update
  BEFORE UPDATE ON layer_4_verification
BEGIN
  SELECT RAISE(ABORT, 'layer_4_verification is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_4_no_delete
  BEFORE DELETE ON layer_4_verification
BEGIN
  SELECT RAISE(ABORT, 'layer_4_verification is append-only: DELETE is forbidden');
END;
```

### Example Entry

```json
{
  "entry_id":          "VER-0001",
  "stage":             "test-planner",
  "story_ref":         "US-0003",
  "verification_type": "integration",
  "criteria": [
    "POST /auth/login returns 200 and a signed JWT when credentials are valid",
    "POST /auth/login returns 401 when credentials are invalid",
    "GET /profile returns 401 when Authorization header is absent",
    "GET /profile returns 401 when JWT signature is invalid",
    "GET /profile returns 200 with correct user object when JWT is valid"
  ],
  "result":      "pending",
  "confidence":  "confirmed",
  "recorded_at": "2025-06-05T10:00:00Z"
}
```

---

## Layer 5 — State

### Purpose

Records the workflow state at specific points in time: checkpoints after major stages and the final closure entry written by the `snapshot` stage. Unlike layers 0–4 (which are populated by the foundation, execution, and quality stages), layer 5 is populated exclusively by `project-tracking` (periodic checkpoints) and `snapshot` (final closure). See the [Lifecycle](#lifecycle) section for the full stage ordering.

### Owning Stage(s)

| Stage | Agent | Entry Types Written |
|---|---|---|
| `project-tracking` | `uwf-core-project-tracking.agent.md` | `checkpoint` |
| `snapshot` | `uwf-core-snapshot.agent.md` | `closure` |

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `entry_id` | `TEXT` | Yes | Sequential identifier — format `STA-NNNN` (e.g., `STA-0001`) |
| `stage` | `TEXT` | Yes | Source stage name |
| `state_type` | `TEXT` | Yes | `checkpoint` \| `closure` |
| `completed_items` | `TEXT` | Yes | JSON array of `entry_id` strings from other layers considered complete at this point |
| `blocked_items` | `TEXT` | Yes | JSON array of objects `{"entry_id": "...", "reason": "..."}` |
| `open_gaps` | `TEXT` | Yes | JSON array of `entry_id` strings referencing entries in any layer (0–4) with `confidence = "gap"`, or Layer 0 entries with `type = "open_question"`, that remain unresolved at this state point |
| `divergence_log` | `TEXT` | Yes | JSON array of objects `{"entry_id": "...", "description": "...", "impact": "..."}` recording where execution differed from `uwf-cbs` |
| `recorded_at` | `TEXT` | Yes | ISO 8601 timestamp |

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS layer_5_state (
  entry_id       TEXT    NOT NULL PRIMARY KEY
                         CHECK(entry_id GLOB 'STA-[0-9][0-9][0-9][0-9]*'),
  stage          TEXT    NOT NULL,
  state_type     TEXT    NOT NULL CHECK(state_type IN (
                   'checkpoint', 'closure')),
  completed_items TEXT   NOT NULL,
  blocked_items   TEXT   NOT NULL,
  open_gaps       TEXT   NOT NULL,
  divergence_log  TEXT   NOT NULL,
  recorded_at    TEXT    NOT NULL
);

-- Enforce append-only
CREATE TRIGGER IF NOT EXISTS layer_5_no_update
  BEFORE UPDATE ON layer_5_state
BEGIN
  SELECT RAISE(ABORT, 'layer_5_state is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS layer_5_no_delete
  BEFORE DELETE ON layer_5_state
BEGIN
  SELECT RAISE(ABORT, 'layer_5_state is append-only: DELETE is forbidden');
END;
```

### Example Entry

```json
{
  "entry_id":   "STA-0001",
  "stage":      "snapshot",
  "state_type": "closure",
  "completed_items": [
    "ACT-0001", "ACT-0002", "ACT-0003",
    "VER-0001", "VER-0002"
  ],
  "blocked_items": [],
  "open_gaps": [
    "CTX-0004"
  ],
  "divergence_log": [
    {
      "entry_id":    "DIV-0001",
      "description": "api.notification-service deferred to next iteration",
      "impact":      "deferral"
    }
  ],
  "recorded_at": "2025-06-10T17:45:00Z"
}
```

---

## JSON Export Schema for uwf-drs

At the `snapshot` stage, `uwf-br` is exported as `uwf-drs` — a portable, forward-reference-free JSON snapshot of the workflow run. The export is produced by serializing all six SQLite layers into a single JSON document.

**File location:** `{output_path}/{role}-drs.json`

### Top-Level Structure

```json
{
  "schema_version": "1.0",
  "exported_at":    "<ISO 8601 timestamp>",
  "workflow":       "<persona name, e.g. 'sw_dev' or 'project_manager'>",
  "role":           "<artifact prefix, e.g. 'issues' or 'project'>",
  "layers": {
    "0": {
      "label":   "Context",
      "entries": [ /* array of Layer 0 entry objects */ ]
    },
    "1": {
      "label":   "Decisions",
      "entries": [ /* array of Layer 1 entry objects */ ]
    },
    "2": {
      "label":   "Dependencies",
      "entries": [ /* array of Layer 2 entry objects */ ]
    },
    "3": {
      "label":   "Actions",
      "entries": [ /* array of Layer 3 entry objects */ ]
    },
    "4": {
      "label":   "Verification",
      "entries": [ /* array of Layer 4 entry objects */ ]
    },
    "5": {
      "label":   "State",
      "entries": [ /* array of Layer 5 entry objects */ ]
    }
  }
}
```

### Field Constraints

| Field | Constraint |
|---|---|
| `schema_version` | Must be `"1.0"` for this version of the schema |
| `exported_at` | ISO 8601 with timezone offset (e.g., `2025-06-10T17:45:00Z`) |
| `layers` | All six keys (`"0"` through `"5"`) must be present; `entries` may be an empty array `[]` for any layer with no records |
| Each layer's `entries` array | Entries must be ordered by `recorded_at` ascending |
| Arrays stored as JSON strings in SQLite (e.g., `preconditions`, `criteria`) | Must be deserialised to JSON arrays before writing to the export |
| `from_component` (SQLite column name in Layer 2) | Must be exported as `"from"` in JSON |

### Producing the Export

The `snapshot` stage is responsible for producing `uwf-drs`. Execute these steps:

1. Open `.github/skills/uwf-cbs/uwf-br.db`.
2. `SELECT * FROM layer_0_context ORDER BY recorded_at ASC` — populate `layers["0"].entries`.
3. `SELECT * FROM layer_1_decisions ORDER BY recorded_at ASC` — populate `layers["1"].entries`. Deserialise `alternatives_rejected` and `constraints_imposed` from JSON strings to arrays.
4. `SELECT * FROM layer_2_dependencies ORDER BY recorded_at ASC` — populate `layers["2"].entries`. Rename `from_component` to `from`.
5. `SELECT * FROM layer_3_actions ORDER BY recorded_at ASC` — populate `layers["3"].entries`. Deserialise `preconditions` and `postconditions` from JSON strings to arrays.
6. `SELECT * FROM layer_4_verification ORDER BY recorded_at ASC` — populate `layers["4"].entries`. Deserialise `criteria` from JSON string to array.
7. `SELECT * FROM layer_5_state ORDER BY recorded_at ASC` — populate `layers["5"].entries`. Deserialise `completed_items`, `blocked_items`, `open_gaps`, and `divergence_log` from JSON strings to arrays.
8. Serialize the complete object as JSON with 2-space indentation.
9. Write to `{output_path}/{role}-drs.json`.

> **Relationship to the snapshot skill:** The `uwf-snapshot` skill (`.github/skills/uwf-snapshot/SKILL.md`) defines additional **processed views** derived from this raw export — curated top-level fields `components`, `environment`, `dependency_graph`, `build_sequence`, `adrs`, `gap_log`, and `divergence_log`. These are appended as additional top-level keys in `{role}-drs.json` alongside the `layers` key defined above. The `layers` export is the canonical, lossless serialization of `uwf-br`; the processed fields are a curated summary intended for cold-starting agents. Both sections coexist in the same JSON file:
>
> ```json
> {
>   "schema_version": "1.0",
>   "exported_at": "...",
>   "workflow": "...",
>   "role": "...",
>   "layers": { "0": {...}, "1": {...}, "2": {...}, "3": {...}, "4": {...}, "5": {...} },
>   "components":       [ /* processed view — see uwf-snapshot/SKILL.md */ ],
>   "environment":      { /* processed view */ },
>   "dependency_graph": { /* processed view */ },
>   "build_sequence":   [ /* processed view */ ],
>   "adrs":             [ /* processed view */ ],
>   "gap_log":          [ /* processed view */ ],
>   "divergence_log":   [ /* processed view */ ]
> }
> ```

---

## Layer Ownership Summary

| Layer | Label | Entry ID Prefix | Written By Stage(s) | Entry Count Guarantee |
|---|---|---|---|---|
| 0 | Context | `CTX-` | `discovery` | ≥ 1 (unless discovery was skipped) |
| 1 | Decisions | `DEC-` | `requirements`, `adr`, `risk-planner`, `security-planner` | ≥ 1 per owning stage that ran |
| 2 | Dependencies | `DEP-` | `risk-planner`, `blueprint` | ≥ 0 (empty if no dependencies identified) |
| 3 | Actions | `ACT-` | `work-planner`, `refinement` | ≥ 1 (at least one action must exist for a workflow run to produce output) |
| 4 | Verification | `VER-` | `test-planner`, `acceptance` | ≥ 1 per owning stage that ran |
| 5 | State | `STA-` | `project-tracking`, `snapshot` | ≥ 1 (`snapshot` always writes a closure entry) |

---

## Lifecycle

```
blueprint (init layers 0–4 schema)
    ↓
discovery      → writes layer 0 entries
requirements   → writes layer 1 entries (requirements)
adr            → writes layer 1 entries (ADRs)
risk-planner   → writes layer 1 entries (risks) + layer 2 entries (blocking deps)
security-plan  → writes layer 1 entries (security-constraints)
blueprint      → writes layer 2 entries (component deps) + layer 3 entries (actions)
test-planner   → writes layer 4 entries
work-planner   → writes layer 3 entries (implementation actions)
refinement     → writes layer 3 entries (review actions)
acceptance     → writes layer 4 entries (acceptance results)
project-tracking → writes layer 5 entries (checkpoints)
snapshot       → writes layer 5 entry (closure) → exports uwf-drs JSON
```

---

## Related Artifacts

| Artifact | Relationship |
|---|---|
| `uwf-cbs` | The Canonical Build Spec (SQLite). `uwf-br` records what happened; `uwf-cbs` records what was planned. `uwf-br` layer 3 entries are derived from `uwf-cbs` sequencing at blueprint time. |
| `uwf-drs` | The JSON export of `uwf-br` at acceptance. Produced by the `snapshot` stage. |
| `uwf-changelog` | A human-readable Markdown append log. Receives a closure entry from `snapshot` at the same time `uwf-br` layer 5 is closed. |
