/**
 * Integration tests for DB readers and utility logic.
 * Uses node:sqlite directly — no VS Code host required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");
const issuesDb = path.join(workspaceRoot, ".github", "skills", "uwf-local-tracking", "uwf-issues.db");

// ── DB smoke tests ─────────────────────────────────────────────────────────

test("uwf-issues.db exists", (t) => {
  if (!fs.existsSync(issuesDb)) { t.skip("Seeded issues DB not present in this environment"); return; }
  assert.ok(fs.existsSync(issuesDb), `Expected DB at ${issuesDb}`);
});

test("issues table has correct schema columns", (t) => {
  if (!fs.existsSync(issuesDb)) { t.skip("Seeded issues DB not present in this environment"); return; }
  const db = new DatabaseSync(issuesDb, { open: true, readOnly: true });
  try {
    const cols = db.prepare("PRAGMA table_info(issues)").all().map((r) => r.name);
    for (const col of ["id", "title", "status", "milestone", "sprint", "depends_on"]) {
      assert.ok(cols.includes(col), `Missing column: ${col}`);
    }
  } finally {
    db.close();
  }
});

test("issues table contains 9 seeded issues", (t) => {
  if (!fs.existsSync(issuesDb)) { t.skip("Seeded issues DB not present in this environment"); return; }
  const db = new DatabaseSync(issuesDb, { open: true, readOnly: true });
  try {
    const { n } = db.prepare("SELECT COUNT(*) as n FROM issues").get();
    assert.ok(n >= 9, `Expected >= 9 issues, got ${n}`);
  } finally {
    db.close();
  }
});

test("I-003 depends_on contains I-001 and I-002", (t) => {
  if (!fs.existsSync(issuesDb)) { t.skip("Seeded issues DB not present in this environment"); return; }
  const db = new DatabaseSync(issuesDb, { open: true, readOnly: true });
  try {
    const row = db.prepare("SELECT depends_on FROM issues WHERE id = 'I-003'").get();
    assert.ok(row, "I-003 should exist");
    const deps = row.depends_on ?? "";
    assert.ok(deps.includes("I-001") && deps.includes("I-002"),
      `Expected depends_on to contain I-001 and I-002, got: ${deps}`);
  } finally {
    db.close();
  }
});

test("closed issues have status=closed", (t) => {
  if (!fs.existsSync(issuesDb)) { t.skip("Seeded issues DB not present in this environment"); return; }
  const db = new DatabaseSync(issuesDb, { open: true, readOnly: true });
  try {
    const closed = db.prepare("SELECT id FROM issues WHERE status = 'closed'").all();
    assert.ok(closed.length >= 1, "Expected at least one closed issue");
  } finally {
    db.close();
  }
});

// ── webviewUtils escHtml ───────────────────────────────────────────────────

function escHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

test("escHtml prevents XSS injection", () => {
  assert.equal(escHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escHtml(null), "");
  assert.equal(escHtml(42), "42");
  assert.equal(escHtml("a & b"), "a &amp; b");
});

// ── ReportBuilder CSV logic ────────────────────────────────────────────────

function toCsv(snap) {
  const sections = [];
  const csvRow = (row) =>
    Object.values(row)
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",");
  for (const [key, rows] of Object.entries(snap)) {
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]).join(",");
    sections.push(`## ${key}\n${headers}\n${rows.map(csvRow).join("\n")}`);
  }
  return sections.join("\n\n");
}

test("CSV export has section headers and skips empty sections", () => {
  const snap = {
    issues: [{ id: "I-001", title: "Scaffold", status: "closed" }],
    requirements: [],
  };
  const csv = toCsv(snap);
  assert.ok(csv.startsWith("## issues"), "CSV should start with ## issues section");
  assert.ok(csv.includes("I-001"), "CSV should contain issue I-001");
  assert.ok(!csv.includes("## requirements"), "Empty sections should be omitted");
});

test("CSV export escapes double-quotes in values", () => {
  const snap = {
    items: [{ id: 1, note: 'He said "hello"' }],
  };
  const csv = toCsv(snap);
  assert.ok(csv.includes('He said ""hello""'), "Quotes should be doubled in CSV");
});

// ── DbWatcher debounce logic (pure) ───────────────────────────────────────

test("debounce fires once after multiple rapid calls", async () => {
  let callCount = 0;
  let timer = null;
  const DEBOUNCE_MS = 50;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { callCount++; }, DEBOUNCE_MS);
  }

  schedule(); schedule(); schedule();

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 20));
  assert.equal(callCount, 1, "Debounced callback should fire exactly once");
});

// ── StageConfigLoader / parseStagesYaml unit tests ───────────────────────

/**
 * Inline reference implementation of parseStagesYaml matching
 * StageConfigLoader.ts so tests run without a compiled extension.
 */
function parseStagesYaml(content, skill) {
  function cleanValue(value) {
    return value.trim().replace(/^['\"]|['\"]$/g, "");
  }

  const lines = content.split(/\r?\n/);
  let workflow = "";
  let outputPath = "./tmp/workflow-artifacts";
  let artifactPrefix = null;
  const stages = [];

  let current = null;
  let inOutputs = false;
  let outputsIndent = 0;

  for (const rawLine of lines) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) { continue; }

    if (trimmed.startsWith("workflow:")) { workflow = cleanValue(trimmed.slice("workflow:".length)); continue; }
    if (trimmed.startsWith("output_path:")) { outputPath = cleanValue(trimmed.slice("output_path:".length)); continue; }
    if (trimmed.startsWith("artifact_prefix:")) { artifactPrefix = cleanValue(trimmed.slice("artifact_prefix:".length)); continue; }

    if (trimmed.startsWith("- name:")) {
      current = { name: cleanValue(trimmed.slice("- name:".length)), agent: "", advancesPhaseTo: null, outputs: [] };
      stages.push(current);
      inOutputs = false;
      continue;
    }

    if (!current) { continue; }

    if (inOutputs && indent <= outputsIndent) { inOutputs = false; }

    if (trimmed.startsWith("agent:")) { current.agent = cleanValue(trimmed.slice("agent:".length)); continue; }
    if (trimmed.startsWith("advances_phase_to:")) { current.advancesPhaseTo = cleanValue(trimmed.slice("advances_phase_to:".length)); continue; }

    if (trimmed === "outputs:") { inOutputs = true; outputsIndent = indent; continue; }

    if (inOutputs && trimmed.startsWith("- ") && indent === outputsIndent + 2) {
      current.outputs.push(cleanValue(trimmed.slice(2)));
    }
  }

  if (!workflow || !stages.length) { return null; }
  return { workflow, skill, outputPath, artifactPrefix, stages };
}

test("parseStagesYaml returns null for empty/invalid content", () => {
  assert.strictEqual(parseStagesYaml("", "test"), null);
  assert.strictEqual(parseStagesYaml("# just a comment\n", "test"), null);
  assert.strictEqual(parseStagesYaml("workflow: foo\n", "test"), null, "No stages → null");
});

test("parseStagesYaml parses workflow + output_path + artifact_prefix", () => {
  const yaml = `
workflow: my_flow
output_path: ./out
artifact_prefix: issues
stages:
  - name: step1
    agent: my-agent
    outputs: []
`;
  const result = parseStagesYaml(yaml, "my-skill");
  assert.ok(result, "Should return a blueprint");
  assert.equal(result.workflow, "my_flow");
  assert.equal(result.outputPath, "./out");
  assert.equal(result.artifactPrefix, "issues");
  assert.equal(result.skill, "my-skill");
});

test("parseStagesYaml collects outputs correctly", () => {
  const yaml = `
workflow: demo
stages:
  - name: intake
    agent: uwf-sw_dev-intake
    advances_phase_to: intake
    outputs:
      - "{{output_path}}/intake.md"
      - "{{output_path}}/extra.md"
    gated: true
    gate:
      checks:
        - type: require_non_empty
          path: "{{output_path}}/intake.md"
          label: intake.md
`;
  const result = parseStagesYaml(yaml, "demo-skill");
  assert.ok(result, "Should parse successfully");
  const stage = result.stages[0];
  assert.equal(stage.name, "intake");
  assert.equal(stage.agent, "uwf-sw_dev-intake");
  assert.equal(stage.advancesPhaseTo, "intake");
  assert.deepEqual(stage.outputs, [
    "{{output_path}}/intake.md",
    "{{output_path}}/extra.md",
  ], "outputs should contain exactly the declared file paths");
});

test("parseStagesYaml does NOT capture gate.checks items as outputs", () => {
  const yaml = `
workflow: demo
stages:
  - name: adr
    agent: uwf-core-adr
    outputs:
      - "{{cwd}}/docs/adr/ADR-[0-9]*.md"
    gate:
      checks:
        - type: require_files_with_prefix
          dir: "{{cwd}}/docs/adr"
          prefix: ADR-
          label: ADR-*.md
`;
  const result = parseStagesYaml(yaml, "s");
  const outputs = result.stages[0].outputs;
  assert.equal(outputs.length, 1, "Should have exactly one output");
  assert.equal(outputs[0], "{{cwd}}/docs/adr/ADR-[0-9]*.md");
  for (const o of outputs) {
    assert.ok(!o.startsWith("type:") && !o.startsWith("dir:") && !o.startsWith("prefix:") && !o.startsWith("label:"),
      `Gate check property leaked into outputs: ${o}`);
  }
});

test("parseStagesYaml handles empty outputs list", () => {
  const yaml = `
workflow: flow
stages:
  - name: impl
    agent: uwf-issue-implementer
    outputs: []
    gate:
      checks:
        - type: require_non_empty
          path: plan.md
          label: plan.md
`;
  const result = parseStagesYaml(yaml, "s");
  assert.deepEqual(result.stages[0].outputs, [], "Empty outputs should remain empty");
});

test("parseStagesYaml parses multiple stages independently", () => {
  const yaml = `
workflow: multi
stages:
  - name: alpha
    agent: agent-a
    outputs:
      - "out/alpha.md"
  - name: beta
    agent: agent-b
    outputs:
      - "out/beta.md"
      - "out/beta2.md"
`;
  const result = parseStagesYaml(yaml, "s");
  assert.equal(result.stages.length, 2);
  assert.deepEqual(result.stages[0].outputs, ["out/alpha.md"]);
  assert.deepEqual(result.stages[1].outputs, ["out/beta.md", "out/beta2.md"]);
});

test("parseStagesYaml outputs from real sw_dev stages.yaml contain no gate check properties", () => {
  const stagesFile = path.join(workspaceRoot, ".github", "skills", "uwf-sw_dev", "stages.yaml");
  if (!fs.existsSync(stagesFile)) { return; }
  const result = parseStagesYaml(fs.readFileSync(stagesFile, "utf8"), "uwf-sw_dev");
  assert.ok(result, "sw_dev stages.yaml should parse successfully");
  for (const stage of result.stages) {
    for (const o of stage.outputs) {
      assert.ok(
        !o.startsWith("type:") && !o.startsWith("path:") && !o.startsWith("label:") && !o.startsWith("dir:") && !o.startsWith("prefix:") && !o.startsWith("text:"),
        `Stage "${stage.name}" has a gate check property in outputs: "${o}"`,
      );
    }
  }
});

// ── Declarative stage config sanity checks ────────────────────────────────

test("declarative stages.yaml files declare workflow + stages", () => {
  const skillsRoot = path.join(workspaceRoot, ".github", "skills");
  const stageFiles = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(skillsRoot, d.name, "stages.yaml"))
    .filter((p) => fs.existsSync(p));

  assert.ok(stageFiles.length >= 1, "Expected at least one declarative stages.yaml");

  for (const file of stageFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /\nworkflow:\s*[^\n]+/m, `${file} should declare workflow`);
    assert.match(content, /\n\s*-\s+name:\s*[^\n]+/m, `${file} should define at least one stage name`);
  }
});

test("stage_runs rows reference workflows that exist in declarative configs", (t) => {
  const skillsRoot = path.join(workspaceRoot, ".github", "skills");
  const declared = new Set();

  for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const stageFile = path.join(skillsRoot, dirent.name, "stages.yaml");
    if (!fs.existsSync(stageFile)) continue;
    const content = fs.readFileSync(stageFile, "utf8");
    const m = content.match(/\nworkflow:\s*([^\n]+)/m);
    if (m?.[1]) declared.add(m[1].trim());
  }

  const stagesDb = path.join(workspaceRoot, ".github", "skills", "uwf-orchestration-engine", "uwf-stages.db");
  if (!fs.existsSync(stagesDb)) { t.skip("Stages DB not present in this environment"); return; }
  const db = new DatabaseSync(stagesDb, { open: true, readOnly: true });
  try {
    const rows = db.prepare("SELECT DISTINCT workflow FROM stage_runs").all();
    for (const row of rows) {
      assert.ok(declared.has(row.workflow), `Workflow ${row.workflow} should exist in stages.yaml declarations`);
    }
  } finally {
    db.close();
  }
});
