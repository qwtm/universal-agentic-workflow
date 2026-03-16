/**
 * Smoke test: canonical stage resolution for intake and discovery stages.
 *
 * Verifies that:
 *   - project_manager.intake resolves to uwf-stage-intake with stage_type: intake
 *   - project_manager.discovery resolves to uwf-stage-discovery with stage_type: discovery
 *   - sw_dev.intake resolves to uwf-stage-intake with stage_type: intake
 *   - sw_dev.discovery resolves to uwf-stage-discovery with stage_type: discovery
 *   - trait_ids are correct for each
 *
 * Usage:
 *   node scripts/uwf-smoke/test-canonical-stage-resolution.mjs
 *
 * Exit codes:
 *   0  all assertions passed
 *   1  one or more assertions failed
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const TRACKER_MJS = join(REPO_ROOT, ".github/skills/uwf-orchestration-engine/stage-tracker.mjs");

let passed = 0;
let failed = 0;

function run(args) {
  try {
    const out = execFileSync(process.execPath, [TRACKER_MJS, ...args], {
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

console.log("\nSmoke test: canonical stage resolution\n");

// 1. project_manager.intake
{
  console.log("1. project_manager.intake → stage_type: intake, resolved_agent: uwf-stage-intake");
  const r = run(["list-stages", "--workflow", "project_manager", "--model-profile", "balanced"]);
  const stages = parseOutput(r);
  const intake = stages?.find((s) => s.name === "intake");
  assert("exits 0", r.ok, r.stderr);
  assert("intake stage exists", intake != null);
  assert("stage_type === intake", intake?.stage_type === "intake");
  assert("resolved_agent === uwf-stage-intake", intake?.resolved_agent === "uwf-stage-intake");
  assert("trait_ids === [project_manager]", JSON.stringify(intake?.trait_ids) === '["project_manager"]');
  assert("inputs is array", Array.isArray(intake?.inputs));
  assert("outputs is non-empty array", Array.isArray(intake?.outputs) && intake.outputs.length > 0);
  assert("model_profile = balanced", intake?.model_profile === "balanced");
}

// 2. project_manager.discovery
{
  console.log("2. project_manager.discovery → stage_type: discovery, resolved_agent: uwf-stage-discovery");
  const r = run(["list-stages", "--workflow", "project_manager", "--model-profile", "balanced"]);
  const stages = parseOutput(r);
  const disc = stages?.find((s) => s.name === "discovery");
  assert("exits 0", r.ok, r.stderr);
  assert("discovery stage exists", disc != null);
  assert("stage_type === discovery", disc?.stage_type === "discovery");
  assert("resolved_agent === uwf-stage-discovery", disc?.resolved_agent === "uwf-stage-discovery");
  assert("trait_ids === [project_manager]", JSON.stringify(disc?.trait_ids) === '["project_manager"]');
  assert("inputs is array", Array.isArray(disc?.inputs));
  assert("outputs is non-empty array", Array.isArray(disc?.outputs) && disc.outputs.length > 0);
  assert("model_profile = balanced", disc?.model_profile === "balanced");
}

// 3. sw_dev.intake
{
  console.log("3. sw_dev.intake → stage_type: intake, resolved_agent: uwf-stage-intake");
  const r = run(["list-stages", "--workflow", "sw_dev", "--model-profile", "balanced"]);
  const stages = parseOutput(r);
  const intake = stages?.find((s) => s.name === "intake");
  assert("exits 0", r.ok, r.stderr);
  assert("intake stage exists", intake != null);
  assert("stage_type === intake", intake?.stage_type === "intake");
  assert("resolved_agent === uwf-stage-intake", intake?.resolved_agent === "uwf-stage-intake");
  assert("trait_ids === [sw_dev]", JSON.stringify(intake?.trait_ids) === '["sw_dev"]');
  assert("inputs is array", Array.isArray(intake?.inputs));
  assert("outputs is non-empty array", Array.isArray(intake?.outputs) && intake.outputs.length > 0);
  assert("model_profile = balanced", intake?.model_profile === "balanced");
}

// 4. sw_dev.discovery
{
  console.log("4. sw_dev.discovery → stage_type: discovery, resolved_agent: uwf-stage-discovery");
  const r = run(["list-stages", "--workflow", "sw_dev", "--model-profile", "balanced"]);
  const stages = parseOutput(r);
  const disc = stages?.find((s) => s.name === "discovery");
  assert("exits 0", r.ok, r.stderr);
  assert("discovery stage exists", disc != null);
  assert("stage_type === discovery", disc?.stage_type === "discovery");
  assert("resolved_agent === uwf-stage-discovery", disc?.resolved_agent === "uwf-stage-discovery");
  assert("trait_ids === [sw_dev]", JSON.stringify(disc?.trait_ids) === '["sw_dev"]');
  assert("inputs is array", Array.isArray(disc?.inputs));
  assert("outputs is non-empty array", Array.isArray(disc?.outputs) && disc.outputs.length > 0);
  assert("model_profile = balanced", disc?.model_profile === "balanced");
}

// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
