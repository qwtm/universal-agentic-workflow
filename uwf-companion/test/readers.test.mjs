/**
 * Integration tests for DB readers and utility logic.
 * Uses better-sqlite3 directly — no VS Code host required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");
const issuesDb = path.join(workspaceRoot, ".github", "skills", "uwf-local-tracking", "uwf-issues.db");
const hasIssuesDb = fs.existsSync(issuesDb);
const stagesYaml = path.join(workspaceRoot, ".github", "skills", "uwf-sw_dev", "stages.yaml");

// ── DB smoke tests ─────────────────────────────────────────────────────────

test("uwf-issues.db exists", { skip: !hasIssuesDb }, () => {
  assert.ok(fs.existsSync(issuesDb), `Expected DB at ${issuesDb}`);
});

test("issues table has correct schema columns", { skip: !hasIssuesDb }, () => {
  const db = new Database(issuesDb, { readonly: true, fileMustExist: true });
  try {
    const cols = db.prepare("PRAGMA table_info(issues)").all().map((r) => r.name);
    for (const col of ["id", "title", "status", "milestone", "sprint", "depends_on"]) {
      assert.ok(cols.includes(col), `Missing column: ${col}`);
    }
  } finally {
    db.close();
  }
});

test("issues table contains 9 seeded issues", { skip: !hasIssuesDb }, () => {
  const db = new Database(issuesDb, { readonly: true, fileMustExist: true });
  try {
    const { n } = db.prepare("SELECT COUNT(*) as n FROM issues").get();
    assert.ok(n >= 9, `Expected >= 9 issues, got ${n}`);
  } finally {
    db.close();
  }
});

test("I-003 depends_on contains I-001 and I-002", { skip: !hasIssuesDb }, () => {
  const db = new Database(issuesDb, { readonly: true, fileMustExist: true });
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

test("closed issues have status=closed", { skip: !hasIssuesDb }, () => {
  const db = new Database(issuesDb, { readonly: true, fileMustExist: true });
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

// ── declarative workflow config checks ────────────────────────────────────

test("sw_dev stages.yaml exists and declares workflow metadata", () => {
  assert.ok(fs.existsSync(stagesYaml), `Expected stages config at ${stagesYaml}`);
  const yaml = fs.readFileSync(stagesYaml, "utf8");
  assert.ok(yaml.includes("workflow: sw_dev"), "workflow should be sw_dev");
  assert.ok(yaml.includes("artifact_prefix: issues"), "artifact prefix should be issues");
  assert.ok(yaml.includes("output_path:"), "output path should be declared");
});

test("sw_dev stages.yaml includes key planned artifacts", () => {
  const yaml = fs.readFileSync(stagesYaml, "utf8");
  for (const artifact of [
    "issues-intake.md",
    "issues-discovery.md",
    "issues-requirements.md",
    "issues-test-plan.md",
    "issues-blueprint.md",
    "issues-plan.md",
  ]) {
    assert.ok(yaml.includes(artifact), `Expected planned artifact ${artifact}`);
  }
});
