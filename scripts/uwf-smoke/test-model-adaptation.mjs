/**
 * Smoke tests for uwf-model-adaptation/resolve.mjs
 *
 * Tests: explicit --profile, --model matching, env vars, default fallback,
 * invalid profile (exit 1), usage error (exit 2).
 *
 * Usage:
 *   node scripts/uwf-smoke/test-model-adaptation.mjs
 *
 * Exit codes:
 *   0  all tests passed
 *   1  one or more tests failed
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOLVE_MJS = resolve(__dirname, "../../.github/skills/uwf-model-adaptation/resolve.mjs");

let passed = 0;
let failed = 0;

function run(args, env = {}) {
  try {
    const out = execFileSync(process.execPath, [RESOLVE_MJS, ...args], {
      env: { ...process.env, ...env },
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

console.log("\nTest suite: uwf-model-adaptation / resolve.mjs\n");

// 1. No args → default balanced
{
  console.log("1. Default profile (no args)");
  const r = run(["detect"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = balanced", j?.profile === "balanced");
  assert("steering_policy present", typeof j?.steering_policy === "object");
}

// 2. Explicit --profile compact
{
  console.log("2. Explicit --profile compact");
  const r = run(["detect", "--profile", "compact"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = compact", j?.profile === "compact");
  assert("instruction_density = expanded", j?.steering_policy?.instruction_density === "expanded");
  assert("include_examples = true", j?.steering_policy?.include_examples === true);
}

// 3. Explicit --profile balanced
{
  console.log("3. Explicit --profile balanced");
  const r = run(["detect", "--profile", "balanced"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = balanced", j?.profile === "balanced");
  assert("instruction_density = standard", j?.steering_policy?.instruction_density === "standard");
}

// 4. Explicit --profile reasoning
{
  console.log("4. Explicit --profile reasoning");
  const r = run(["detect", "--profile", "reasoning"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = reasoning", j?.profile === "reasoning");
  assert("instruction_density = compact", j?.steering_policy?.instruction_density === "compact");
  assert("step_expansion = false", j?.steering_policy?.step_expansion === false);
}

// 5. --model haiku → compact
{
  console.log("5. --model haiku → compact");
  const r = run(["detect", "--model", "claude-haiku"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = compact", j?.profile === "compact");
  assert("model_name = claude-haiku", j?.model_name === "claude-haiku");
}

// 6. --model opus → reasoning
{
  console.log("6. --model opus → reasoning");
  const r = run(["detect", "--model", "claude-opus"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = reasoning", j?.profile === "reasoning");
}

// 7. --model unknown → balanced (default fallback)
{
  console.log("7. --model unknown-model → balanced fallback");
  const r = run(["detect", "--model", "unknown-model-xyz"]);
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = balanced (fallback)", j?.profile === "balanced");
}

// 8. UWF_MODEL_PROFILE env var
{
  console.log("8. UWF_MODEL_PROFILE env var → compact");
  const r = run(["detect"], { UWF_MODEL_PROFILE: "compact" });
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = compact", j?.profile === "compact");
}

// 9. --profile takes precedence over UWF_MODEL_PROFILE
{
  console.log("9. --profile overrides UWF_MODEL_PROFILE");
  const r = run(["detect", "--profile", "reasoning"], { UWF_MODEL_PROFILE: "compact" });
  const j = parseOutput(r);
  assert("exits 0", r.ok);
  assert("profile = reasoning (--profile wins)", j?.profile === "reasoning");
}

// 10. Invalid --profile → exit 1
{
  console.log("10. Invalid --profile → exit 1");
  const r = run(["detect", "--profile", "super-smart"]);
  assert("exits 1", !r.ok && r.exitCode === 1);
}

// 11. No subcommand → exit 2
{
  console.log("11. No subcommand → exit 2");
  const r = run([]);
  assert("exits 2", r.exitCode === 2);
}

// 12. Unknown subcommand → exit 2
{
  console.log("12. Unknown subcommand → exit 2");
  const r = run(["infer"]);
  assert("exits 2", r.exitCode === 2);
}

// 13. --profile flag without value → exit 2 (not exit 1)
{
  console.log("13. --profile without value → exit 2");
  const r = run(["detect", "--profile"]);
  assert("exits 2", r.exitCode === 2);
}

// 14. --model flag without value → exit 2 (not exit 0 / silent ignore)
{
  console.log("14. --model without value → exit 2");
  const r = run(["detect", "--model"]);
  assert("exits 2", r.exitCode === 2);
}

// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
