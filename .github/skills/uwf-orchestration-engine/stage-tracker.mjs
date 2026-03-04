/**
 * UWF Stage Tracker — centralized SQLite-backed stage management CLI.
 *
 * Stage definitions are declared in YAML files co-located with each persona skill:
 *   .github/skills/uwf-{workflow}/stages.yaml
 *
 * Database:  .github/skills/uwf-orchestration-engine/uwf-stages.db
 * Schema:    .github/skills/uwf-orchestration-engine/stage-schema.yaml
 *
 * Usage:
 *   node .github/skills/uwf-orchestration-engine/stage-tracker.mjs <command> [options]
 *
 * Commands:
 *   list-stages    --workflow <name>                          List stages from YAML as JSON
 *   check-gate     --workflow <name> --stage <s>             Evaluate gate; exit 0=pass 1=fail
 *   init           --workflow <name>                          Reset stage tracking for workflow
 *   read           --workflow <name>                          Read current execution state
 *   stage-start    --workflow <name> --stage <s>             Mark stage active
 *   stage-complete --workflow <name> --stage <s>             Mark stage passed
 *   stage-fail     --workflow <name> --stage <s> [--note <t>] Increment retry, record failure
 *   stage-skip     --workflow <name> --stage <s>             Mark stage skipped
 *
 * Global options:
 *   --output-path <path>   Default: ./tmp/workflow-artifacts
 *   --state-path  <path>   Default: ./tmp/uwf-state.json
 *
 * Exit codes:
 *   0  success (gate passed for check-gate)
 *   1  operational error (gate failed for check-gate)
 *   2  usage error
 *
 * All output is JSON to stdout.
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH    = join(__dirname, "uwf-stages.db");
const SCHEMA_PATH = join(__dirname, "stage-schema.yaml");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const [command, ...rest] = args;
const flags = parseFlags(rest);

const workflow   = flags["workflow"];
const outputPath = flags["output-path"] ?? "./tmp/workflow-artifacts";
const statePath  = flags["state-path"]  ?? "./tmp/uwf-state.json";

if (!command) usageError("No command provided.");

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initTables(db);
  return db;
}

function initTables(db) {
  const schema = yaml.load(readFileSync(SCHEMA_PATH, "utf8"));
  db.transaction(() => {
    for (const [tableName, def] of Object.entries(schema.tables)) {
      db.exec(buildCreateTable(tableName, def.columns));
    }
  })();
}

function buildCreateTable(tableName, columns) {
  const defs = columns.map((col) => {
    let d = `"${col.name}" ${col.type}`;
    if (col.primary_key && col.autoincrement) d += " PRIMARY KEY AUTOINCREMENT";
    else if (col.primary_key) d += " PRIMARY KEY";
    if (col.not_null) d += " NOT NULL";
    if (col.default !== undefined) {
      const v = typeof col.default === "string" ? `'${col.default}'` : col.default;
      d += ` DEFAULT ${v}`;
    }
    return d;
  });
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${defs.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Stages YAML loader
// ---------------------------------------------------------------------------

function loadStagesYaml(wf) {
  const yamlPath = resolve(join(".github", "skills", `uwf-${wf}`, "stages.yaml"));
  if (!existsSync(yamlPath)) usageError(`stages.yaml not found for workflow "${wf}": ${yamlPath}`);
  return yaml.load(readFileSync(yamlPath, "utf8"));
}

function resolveTemplates(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\{\{output_path\}\}/g, outputPath)
    .replace(/\{\{state_path\}\}/g,  statePath)
    .replace(/\{\{cwd\}\}/g,         process.cwd());
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

try {
  const db = openDb();
  switch (command) {
    case "list-stages":    cmdListStages(db); break;
    case "check-gate":     cmdCheckGate(db);  break;
    case "init":           cmdInit(db);        break;
    case "read":           cmdRead(db);        break;
    case "stage-start":    cmdStageUpdate(db, "active");    break;
    case "stage-complete": cmdStageUpdate(db, "passed");    break;
    case "stage-fail":     cmdStageFail(db);               break;
    case "stage-skip":     cmdStageUpdate(db, "skipped");  break;
    default: usageError(`Unknown command: "${command}"`);
  }
} catch (err) {
  fail(err.message);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdListStages(db) {
  requireFlag("workflow", "list-stages");
  const { stages } = loadStagesYaml(workflow);
  const list = stages.map(({ name, agent, max_retries, on_gate_failure, gated, conditional, run_as_subagent, inputs, outputs }) => ({
    name, agent,
    maxRetries: max_retries ?? 2,
    onGateFailure: on_gate_failure ?? "retry",
    gated: gated !== false,
    conditional: conditional === true,
    runAsSubagent: run_as_subagent !== false,
    inputs: inputs ?? [],
    outputs: outputs ?? [],
  }));
  process.stdout.write(JSON.stringify(list, null, 2) + "\n");
  process.exit(0);
}

function cmdCheckGate(db) {
  requireFlag("workflow", "check-gate");
  requireFlag("stage",    "check-gate");

  const stageName = flags["stage"];
  const { stages } = loadStagesYaml(workflow);
  const stageDef = stages.find((s) => s.name === stageName);
  if (!stageDef) usageError(`Unknown stage "${stageName}" in workflow "${workflow}".`);

  const result = evaluateGate(stageDef, stageName);

  // Persist gate result to DB
  const row = db.prepare(
    `SELECT id FROM stage_runs WHERE workflow = ? AND stage = ?`
  ).get(workflow, stageName);
  if (row) {
    db.prepare(
      `UPDATE stage_runs SET gate_result = ? WHERE workflow = ? AND stage = ?`
    ).run(JSON.stringify(result), workflow, stageName);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.passed ? 0 : 1);
}

function cmdInit(db) {
  requireFlag("workflow", "init");
  const { stages } = loadStagesYaml(workflow);

  db.transaction(() => {
    // Remove existing tracking rows for this workflow
    db.prepare(`DELETE FROM stage_runs WHERE workflow = ?`).run(workflow);
    // Seed a row per stage
    const insert = db.prepare(
      `INSERT INTO stage_runs (workflow, stage, status, retry_count, run_as_subagent) VALUES (?, ?, 'pending', 0, ?)`
    );
    for (const s of stages) insert.run(workflow, s.name, s.run_as_subagent !== false ? 1 : 0);
    // Log history
    appendHistory(db, workflow, "*", null, "pending", "Workflow initialized");
  })();

  succeed({ procedure: "init", workflow, stages: stages.map((s) => s.name), state: readState(db) });
}

function cmdRead(db) {
  requireFlag("workflow", "read");
  succeed({ procedure: "read", workflow, state: readState(db) });
}

function cmdStageUpdate(db, toStatus) {
  requireFlag("workflow", command);
  requireFlag("stage",    command);
  const stageName = flags["stage"];
  const note = flags["note"] ?? null;

  ensureRow(db, stageName);
  const row = db.prepare(`SELECT * FROM stage_runs WHERE workflow = ? AND stage = ?`).get(workflow, stageName);
  const now = new Date().toISOString();

  const updates = { status: toStatus };
  if (toStatus === "active")  updates.started_at   = now;
  if (toStatus === "passed" || toStatus === "skipped") updates.completed_at = now;
  if (note) updates.notes = note;

  const keys = Object.keys(updates);
  db.prepare(`UPDATE stage_runs SET ${keys.map((k) => `"${k}" = ?`).join(", ")} WHERE workflow = ? AND stage = ?`)
    .run(...keys.map((k) => updates[k]), workflow, stageName);

  appendHistory(db, workflow, stageName, row.status, toStatus, note);
  succeed({ procedure: command, workflow, stage: stageName, status: toStatus, state: readState(db) });
}

function cmdStageFail(db) {
  requireFlag("workflow", "stage-fail");
  requireFlag("stage",    "stage-fail");
  const stageName = flags["stage"];
  const note = flags["note"] ?? null;

  ensureRow(db, stageName);
  const row = db.prepare(`SELECT * FROM stage_runs WHERE workflow = ? AND stage = ?`).get(workflow, stageName);

  db.prepare(
    `UPDATE stage_runs SET status = 'failed', retry_count = retry_count + 1, completed_at = ?, notes = ? WHERE workflow = ? AND stage = ?`
  ).run(new Date().toISOString(), note, workflow, stageName);

  appendHistory(db, workflow, stageName, row.status, "failed", note);
  const updated = db.prepare(`SELECT * FROM stage_runs WHERE workflow = ? AND stage = ?`).get(workflow, stageName);
  succeed({ procedure: "stage-fail", workflow, stage: stageName, retry_count: updated.retry_count, state: readState(db) });
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

function evaluateGate(stageDef, stageName) {
  // Ungated stages always pass
  if (stageDef.gated === false) {
    return { stage: stageName, passed: true, failures: [], note: "ungated — always passes" };
  }

  // Conditional stage: check if condition is met; if not, auto-pass
  if (stageDef.conditional === true && stageDef.condition) {
    if (!evaluateCondition(stageDef.condition)) {
      return { stage: stageName, passed: true, failures: [], note: "conditional — not required" };
    }
  }

  // Evaluate gate checks
  const failures = [];
  for (const check of (stageDef.gate?.checks ?? [])) {
    const failure = evaluateCheck(check);
    if (failure) failures.push(failure);
  }

  return failures.length
    ? { stage: stageName, passed: false, failures }
    : { stage: stageName, passed: true,  failures: [] };
}

function evaluateCondition(condition) {
  const path = resolveTemplates(condition.path);
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");

  switch (condition.type) {
    case "file_contains":
      return content.includes(condition.text);
    case "file_contains_any":
      return (condition.texts ?? []).some((t) => content.includes(t));
    default:
      return false;
  }
}

function evaluateCheck(check) {
  switch (check.type) {
    case "require_non_empty": {
      const p = resolveTemplates(check.path);
      if (!existsSync(p)) return `Missing: ${check.label ?? p}`;
      if (statSync(p).size === 0) return `Empty: ${check.label ?? p}`;
      return null;
    }
    case "require_contains": {
      const p = resolveTemplates(check.path);
      if (!existsSync(p)) return null; // let require_non_empty catch it
      if (!readFileSync(p, "utf8").includes(check.text)) {
        return `${check.label ?? p} does not contain: "${check.text}"`;
      }
      return null;
    }
    case "require_files_with_prefix": {
      const dir = resolveTemplates(check.dir);
      if (!existsSync(dir)) return `Directory missing: ${dir}`;
      const matches = readdirSync(dir).filter((f) => f.startsWith(check.prefix));
      if (matches.length === 0) return `No ${check.label ?? check.prefix + "*"} files found in ${dir}`;
      return null;
    }
    case "require_file_matching_pattern": {
      const dir = resolveTemplates(check.dir);
      if (!existsSync(dir)) return `Directory missing: ${dir}`;
      const pattern = new RegExp(check.pattern);
      const found = walkDir(dir).some((f) => pattern.test(f));
      if (!found) return `No ${check.label ?? check.pattern} matches found under ${dir}`;
      return null;
    }
    default:
      return `Unknown check type: "${check.type}"`;
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function readState(db) {
  return db.prepare(`SELECT * FROM stage_runs WHERE workflow = ? ORDER BY id ASC`).all(workflow);
}

function ensureRow(db, stageName) {
  const exists = db.prepare(`SELECT id FROM stage_runs WHERE workflow = ? AND stage = ?`).get(workflow, stageName);
  if (!exists) {
    const { stages } = loadStagesYaml(workflow);
    const stageDef = stages.find((s) => s.name === stageName);
    const runAsSubagent = stageDef ? (stageDef.run_as_subagent !== false ? 1 : 0) : 1;
    db.prepare(`INSERT INTO stage_runs (workflow, stage, status, retry_count, run_as_subagent) VALUES (?, ?, 'pending', 0, ?)`)
      .run(workflow, stageName, runAsSubagent);
  }
}

function appendHistory(db, wf, stage, fromStatus, toStatus, notes) {
  db.prepare(
    `INSERT INTO stage_history (workflow, stage, from_status, to_status, ts, notes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(wf, stage, fromStatus ?? null, toStatus, new Date().toISOString(), notes ?? null);
}

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/** Called by persona run.mjs shims to forward --list-stages / --check-gate. */
export function runShim(wf) {
  // Inject --workflow <wf> if not already present
  if (!process.argv.includes("--workflow")) {
    process.argv.push("--workflow", wf);
  }
  // Re-parse is unnecessary — module already evaluated. Instead, proxy by
  // re-executing the CLI via the already-parsed `flags` object trick:
  // We can't re-run the module, so shims must pass --workflow explicitly.
  // This export is kept for documentation; shims use the direct CLI pattern.
}

function succeed(payload) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }, null, 2) + "\n");
  process.exit(0);
}

function fail(message, extras = {}) {
  process.stdout.write(JSON.stringify({ ok: false, error: message, ...extras }, null, 2) + "\n");
  process.exit(1);
}

function usageError(message) {
  process.stderr.write(`Usage error: ${message}\n`);
  process.exit(2);
}

function requireFlag(name, cmd) {
  if (!flags[name]) usageError(`Command "${cmd}" requires --${name}.`);
}

function parseFlags(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        result[key] = argv[++i];
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}
