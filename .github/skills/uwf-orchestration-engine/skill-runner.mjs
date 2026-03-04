/**
 * UWF Skill Runner — shared gate enforcement utilities.
 *
 * Every persona `run.mjs` imports helpers from here.
 * The orchestrator agent invokes a persona run.mjs via terminal:
 *
 *   node .github/skills/uwf-<name>/run.mjs --list-stages
 *   node .github/skills/uwf-<name>/run.mjs --check-gate <stageName> [--output-path <path>]
 *
 * Exit codes:
 *   0  gate passed (or --list-stages succeeded)
 *   1  gate failed — details written to stdout as JSON
 *   2  usage error (unknown stage name, bad args)
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

/** @param {string[]} failures */
export function gatePass(stageName) {
  return { stage: stageName, passed: true, failures: [] };
}

/** @param {string} stageName @param {string[]} failures */
export function gateFail(stageName, failures) {
  return { stage: stageName, passed: false, failures };
}

// ---------------------------------------------------------------------------
// Filesystem check primitives
// ---------------------------------------------------------------------------

/**
 * Returns a failure message if the file is absent or empty, otherwise null.
 * @param {string} filePath
 * @param {string} [label]
 * @returns {string|null}
 */
export function requireNonEmptyFile(filePath, label) {
  const display = label ?? filePath;
  if (!fs.existsSync(filePath)) {
    return `Missing: ${display}`;
  }
  const size = fs.statSync(filePath).size;
  if (size === 0) {
    return `Empty: ${display}`;
  }
  return null;
}

/**
 * Returns a failure message if the file exists but does not contain the
 * expected string, otherwise null. Skips the check if the file is missing
 * (combine with requireNonEmptyFile for a full check).
 * @param {string} filePath
 * @param {string} needle
 * @param {string} [label]
 * @returns {string|null}
 */
export function requireFileContains(filePath, needle, label) {
  if (!fs.existsSync(filePath)) return null; // let requireNonEmptyFile catch it
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(needle)) {
    return `${label ?? filePath} does not contain expected text: "${needle}"`;
  }
  return null;
}

/**
 * Returns a failure message if no files match the glob-style prefix pattern,
 * otherwise null.
 * @param {string} directory
 * @param {string} prefix   e.g. "ADR-"
 * @param {string} [label]
 * @returns {string|null}
 */
export function requireFilesWithPrefix(directory, prefix, label) {
  if (!fs.existsSync(directory)) {
    return `Directory missing: ${directory}`;
  }
  const matches = fs.readdirSync(directory).filter((f) => f.startsWith(prefix));
  if (matches.length === 0) {
    return `No ${label ?? prefix + "*"} files found in ${directory}`;
  }
  return null;
}

/**
 * Returns a failure message if no files match the recursive glob pattern
 * (simple glob: supports ** and *).
 * @param {string} baseDir
 * @param {RegExp} pattern  applied against relative path from baseDir
 * @param {string} [label]
 * @returns {string|null}
 */
export function requireFileMatchingPattern(baseDir, pattern, label) {
  if (!fs.existsSync(baseDir)) {
    return `Directory missing: ${baseDir}`;
  }
  const found = walkDir(baseDir).some((f) => pattern.test(f));
  if (!found) {
    return `No ${label ?? pattern.toString()} matches found under ${baseDir}`;
  }
  return null;
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLI runner — called by every persona run.mjs
// ---------------------------------------------------------------------------

/**
 * Parse CLI args and dispatch to the appropriate action.
 *
 * @param {Array<{
 *   name: string,
 *   agent: string,
 *   maxRetries: number,
 *   onGateFailure: "retry"|"abort"|"skip",
 *   gate: (outputPath: string, statePath: string) => import('./skill-runner.mjs').GateResult
 * }>} stages
 */
export function runCLI(stages) {
  const args = process.argv.slice(2);

  // --list-stages
  if (args.includes("--list-stages")) {
    const list = stages.map(({ name, agent, maxRetries, onGateFailure }) => ({
      name,
      agent,
      maxRetries,
      onGateFailure,
    }));
    process.stdout.write(JSON.stringify(list, null, 2) + "\n");
    process.exit(0);
  }

  // --check-gate <stageName> [--output-path <path>]
  const gateIdx = args.indexOf("--check-gate");
  if (gateIdx !== -1) {
    const stageName = args[gateIdx + 1];
    if (!stageName) {
      process.stderr.write("Usage: --check-gate <stageName>\n");
      process.exit(2);
    }

    const outputPath = argValue(args, "--output-path") ?? "./tmp/workflow-artifacts";

    const stage = stages.find((s) => s.name === stageName);
    if (!stage) {
      process.stderr.write(`Unknown stage: "${stageName}"\n`);
      process.stderr.write(`Known stages: ${stages.map((s) => s.name).join(", ")}\n`);
      process.exit(2);
    }

    const result = stage.gate(outputPath);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.passed ? 0 : 1);
  }

  process.stderr.write(
    "Usage:\n" +
      "  node run.mjs --list-stages\n" +
      "  node run.mjs --check-gate <stageName> [--output-path <path>]\n"
  );
  process.exit(2);
}

function argValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}
