/**
 * Smoke tests for state.mjs set-model-profile command.
 *
 * Tests: store model profile, read it back, invalid profile rejected,
 * model_name optional, model_profile exposed in readState.
 *
 * Usage:
 *   node scripts/uwf-smoke/test-state-model-profile.mjs
 *
 * Exit codes:
 *   0  all tests passed
 *   1  one or more tests failed
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const STATE_MJS = join(REPO_ROOT, ".github/skills/uwf-state-manager/state.mjs");

let passed = 0;
let failed = 0;

function run(args) {
  try {
    const out = execFileSync(process.execPath, [STATE_MJS, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { ok: true, output: out, exitCode: 0 };
  } catch (err) {
    return { ok: false, output: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? 1 };
  }
}

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

function parseOutput(result) {
  try { return JSON.parse(result.output); } catch { return null; }
}

// ---------------------------------------------------------------------------

console.log("\nTest suite: state.mjs / set-model-profile\n");

// Ensure clean slate
run(["init"]);

// 1. set-model-profile balanced
{
  console.log("1. set-model-profile --profile balanced");
  const r = run(["set-model-profile", "--profile", "balanced"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok, r.output + r.stderr);
  assert("procedure = set-model-profile", j?.procedure === "set-model-profile");
  assert("model_profile = balanced", j?.model_profile === "balanced");
  assert("model_name = null", j?.model_name === null);
  assert("state.model_profile = balanced", j?.state?.model_profile === "balanced");
}

// 2. set-model-profile compact + model name
{
  console.log("2. set-model-profile --profile compact --model claude-haiku");
  const r = run(["set-model-profile", "--profile", "compact", "--model", "claude-haiku"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("model_profile = compact", j?.model_profile === "compact");
  assert("model_name = claude-haiku", j?.model_name === "claude-haiku");
  assert("state.model_name = claude-haiku", j?.state?.model_name === "claude-haiku");
}

// 3. Read back persisted model profile
{
  console.log("3. read → model_profile and model_name persisted");
  const r = run(["read"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("state.model_profile = compact", j?.state?.model_profile === "compact");
  assert("state.model_name = claude-haiku", j?.state?.model_name === "claude-haiku");
}

// 4. set-model-profile reasoning (overwrite)
{
  console.log("4. Overwrite with reasoning profile");
  const r = run(["set-model-profile", "--profile", "reasoning"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("model_profile = reasoning", j?.model_profile === "reasoning");
}

// 5. Invalid profile → exits 1
{
  console.log("5. Invalid profile → exits 1");
  const r = run(["set-model-profile", "--profile", "mega-smart"]);
  assert("exits 1", !r.ok && r.exitCode === 1);
}

// 6. Missing --profile flag → exits 2
{
  console.log("6. Missing --profile → exits 2");
  const r = run(["set-model-profile"]);
  assert("exits 2", r.exitCode === 2);
}

// 7. After invalid attempt, state unchanged
{
  console.log("7. State unchanged after invalid attempt");
  const r = run(["read"]);
  const j = parseOutput(r);
  assert("model_profile still reasoning", j?.state?.model_profile === "reasoning");
}

// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
