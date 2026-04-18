/**
 * Smoke tests for stage resolution in stage-tracker.mjs (--list-stages).
 *
 * Tests: new-style stage (discovery), legacy stage (intake), conflict detection
 * (both agent + stage_type), unknown stage_type, unknown trait, unsupported trait,
 * model-profile flag propagation, and backward compatibility.
 *
 * Usage:
 *   node scripts/uwf-smoke/test-stage-resolution.mjs
 *
 * Exit codes:
 *   0  all tests passed
 *   1  one or more tests failed
 */

import { execFileSync, execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, unlinkSync, rmSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const TRACKER_MJS = join(REPO_ROOT, ".github/skills/uwf-orchestration-engine/stage-tracker.mjs");
const TMP_SKILLS = join(REPO_ROOT, ".github/skills");

let passed = 0;
let failed = 0;

function run(args, env = {}) {
  try {
    const out = execFileSync(process.execPath, [TRACKER_MJS, ...args], {
      cwd: REPO_ROOT,
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

console.log("\nTest suite: stage-tracker.mjs / --list-stages\n");

// 1. project_manager discovery is resolved as new-style
{
  console.log("1. project_manager discovery → new-style (stage_type: discovery)");
  const r = run(["list-stages", "--workflow", "project_manager"]);
  const stages = parseOutput(r);
  const disc = stages?.find((s) => s.name === "discovery");
  assert("exits 0", r.ok, r.output + r.stderr);
  assert("stage_type = discovery", disc?.stage_type === "discovery");
  assert("trait_ids = [project_manager]", JSON.stringify(disc?.trait_ids) === '["project_manager"]');
  assert("resolved_agent = uwf-core-discovery", disc?.resolved_agent === "uwf-core-discovery");
  assert("behavior_policy present", typeof disc?.behavior_policy === "object" && disc.behavior_policy !== null);
  assert("steering_policy present", typeof disc?.steering_policy === "object" && disc.steering_policy !== null);
  assert("model_profile = balanced (default)", disc?.model_profile === "balanced");
  assert("question_policy = aggressive (trait merge)", disc?.behavior_policy?.question_policy === "aggressive");
  assert("must_address includes goal", disc?.behavior_policy?.must_address?.includes("goal"));
  assert("must_address includes unknowns (from default)", disc?.behavior_policy?.must_address?.includes("unknowns"));
}

// 2. sw_dev discovery has sw_dev trait
{
  console.log("2. sw_dev discovery → new-style (traits: [sw_dev])");
  const r = run(["list-stages", "--workflow", "sw_dev"]);
  const stages = parseOutput(r);
  const disc = stages?.find((s) => s.name === "discovery");
  assert("exits 0", r.ok);
  assert("trait_ids = [sw_dev]", JSON.stringify(disc?.trait_ids) === '["sw_dev"]');
  assert("evidence_threshold = high", disc?.behavior_policy?.evidence_threshold === "high");
  assert("risk_focus includes technical", disc?.behavior_policy?.risk_focus?.includes("technical"));
}

// 3. Legacy stages remain backward compatible
{
  console.log("3. project_manager intake → legacy stage (agent field)");
  const r = run(["list-stages", "--workflow", "project_manager"]);
  const stages = parseOutput(r);
  const intake = stages?.find((s) => s.name === "intake");
  assert("exits 0", r.ok);
  assert("agent = uwf-project_manager-intake", intake?.agent === "uwf-project_manager-intake");
  assert("stage_type = null", intake?.stage_type === null);
  assert("trait_ids = []", JSON.stringify(intake?.trait_ids) === "[]");
  assert("behavior_policy = null", intake?.behavior_policy === null);
  assert("steering_policy = null", intake?.steering_policy === null);
}

// 4. --model-profile flag propagates to new-style stages
{
  console.log("4. --model-profile compact propagates to discovery stage");
  const r = run(["list-stages", "--workflow", "project_manager", "--model-profile", "compact"]);
  const stages = parseOutput(r);
  const disc = stages?.find((s) => s.name === "discovery");
  assert("exits 0", r.ok);
  assert("model_profile = compact", disc?.model_profile === "compact");
  assert("instruction_density = expanded", disc?.steering_policy?.instruction_density === "expanded");
}

// 5. Stage order unchanged — discovery is still position 2 (0-indexed: 1)
{
  console.log("5. Stage order unchanged — discovery at position 2");
  const r = run(["list-stages", "--workflow", "project_manager"]);
  const stages = parseOutput(r);
  assert("exits 0", r.ok);
  assert("intake first", stages?.[0]?.name === "intake");
  assert("discovery second", stages?.[1]?.name === "discovery");
  assert("requirements third", stages?.[2]?.name === "requirements");
}

// 6. check-gate still works for discovery
{
  console.log("6. check-gate discovery → expected fail (artifact missing)");
  const r = run(["check-gate", "--workflow", "project_manager", "--stage", "discovery"]);
  assert("exits 1 (gate fail — artifact missing)", !r.ok && r.exitCode === 1);
  const j = parseOutput(r);
  assert("passed = false", j?.passed === false);
  assert("failures list non-empty", Array.isArray(j?.failures) && j.failures.length > 0);
}

// 7. Conflict: both agent + stage_type → exits 1
{
  console.log("7. Conflict: agent + stage_type on same stage → error");
  // Create a temporary stages.yaml with a conflicting stage
  const tmpSkillDir = join(TMP_SKILLS, "uwf-test-conflict-tmp");
  mkdirSync(tmpSkillDir, { recursive: true });
  const conflictYaml = `
workflow: test-conflict-tmp
artifact_prefix: test
output_path: ./tmp/workflow-artifacts
stages:
  - name: conflicting
    agent: uwf-core-discovery
    stage_type: discovery
    traits:
      - project_manager
    max_retries: 1
    gated: false
`;
  writeFileSync(join(tmpSkillDir, "stages.yaml"), conflictYaml);
  const r = run(["list-stages", "--workflow", "test-conflict-tmp"]);
  assert("exits non-zero", !r.ok);
  // Cleanup
  try { unlinkSync(join(tmpSkillDir, "stages.yaml")); } catch {}
  try { rmSync(tmpSkillDir, { recursive: true, force: true }); } catch {}
}

// 8. Unknown stage_type → exits 1
{
  console.log("8. Unknown stage_type → error");
  const tmpSkillDir = join(TMP_SKILLS, "uwf-test-unknown-type-tmp");
  mkdirSync(tmpSkillDir, { recursive: true });
  const yaml = `
workflow: test-unknown-type-tmp
artifact_prefix: test
output_path: ./tmp/workflow-artifacts
stages:
  - name: mything
    stage_type: nonexistent_stage_type
    traits:
      - project_manager
    max_retries: 1
    gated: false
`;
  writeFileSync(join(tmpSkillDir, "stages.yaml"), yaml);
  const r = run(["list-stages", "--workflow", "test-unknown-type-tmp"]);
  assert("exits non-zero", !r.ok);
  try { unlinkSync(join(tmpSkillDir, "stages.yaml")); } catch {}
  try { rmSync(tmpSkillDir, { recursive: true, force: true }); } catch {}
}

// 9. Unsupported trait → exits 1
{
  console.log("9. Unsupported trait → error");
  const tmpSkillDir = join(TMP_SKILLS, "uwf-test-bad-trait-tmp");
  mkdirSync(tmpSkillDir, { recursive: true });
  const yaml = `
workflow: test-bad-trait-tmp
artifact_prefix: test
output_path: ./tmp/workflow-artifacts
stages:
  - name: discovery
    stage_type: discovery
    traits:
      - unknown_trait_xyz
    max_retries: 1
    gated: false
`;
  writeFileSync(join(tmpSkillDir, "stages.yaml"), yaml);
  const r = run(["list-stages", "--workflow", "test-bad-trait-tmp"]);
  assert("exits non-zero", !r.ok);
  try { unlinkSync(join(tmpSkillDir, "stages.yaml")); } catch {}
  try { rmSync(tmpSkillDir, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
