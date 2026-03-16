/**
 * UWF Model Adaptation Resolver
 *
 * Resolves the model profile and returns a structured steering policy.
 *
 * Usage:
 *   node .github/skills/uwf-model-adaptation/resolve.mjs detect [--profile <name>] [--model <model_name>]
 *
 * Resolution priority:
 *   1. --profile flag (explicit; invalid value exits 1)
 *   2. --model flag (matched via model_map in profiles.yaml)
 *   3. UWF_MODEL_PROFILE env var
 *   4. UWF_MODEL_NAME env var (matched via model_map)
 *   5. default: balanced
 *
 * Output: JSON to stdout
 *   { profile, model_name, steering_policy }
 *
 * Exit codes:
 *   0  success
 *   1  invalid explicit profile (--profile was given but unknown)
 *   2  usage error
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, "profiles.yaml");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const [subcommand, ...rest] = args;

if (!subcommand) {
  process.stderr.write("Usage error: No subcommand provided. Usage: detect [--profile <name>] [--model <name>]\n");
  process.exit(2);
}

if (subcommand !== "detect") {
  process.stderr.write(`Usage error: Unknown subcommand "${subcommand}". Valid: detect\n`);
  process.exit(2);
}

const flags = parseFlags(rest);

// ---------------------------------------------------------------------------
// Load profiles
// ---------------------------------------------------------------------------

const profileData = yaml.load(readFileSync(PROFILES_PATH, "utf8"));
const validProfiles = Object.keys(profileData.profiles);
const defaultProfile = profileData.default_profile ?? "balanced";
const modelMap = profileData.model_map ?? {};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

let resolvedProfile = null;
let resolvedModel = flags.model ?? null;

// 1. --profile flag (explicit)
if (flags.profile !== undefined) {
  if (flags.profile === true) {
    process.stderr.write("Usage error: --profile requires a value (e.g. --profile balanced)\n");
    process.exit(2);
  }
  if (!validProfiles.includes(flags.profile)) {
    process.stderr.write(`Error: invalid profile "${flags.profile}". Valid profiles: ${validProfiles.join(", ")}\n`);
    process.exit(1);
  }
  resolvedProfile = flags.profile;
}

// 2. --model flag
if (!resolvedProfile && flags.model !== undefined) {
  if (flags.model === true) {
    process.stderr.write("Usage error: --model requires a value (e.g. --model claude-sonnet)\n");
    process.exit(2);
  }
  resolvedProfile = matchModelToProfile(flags.model, modelMap);
  resolvedModel = flags.model;
}

// 3. UWF_MODEL_PROFILE env var
if (!resolvedProfile && process.env.UWF_MODEL_PROFILE) {
  const envProfile = process.env.UWF_MODEL_PROFILE;
  if (validProfiles.includes(envProfile)) {
    resolvedProfile = envProfile;
  }
}

// 4. UWF_MODEL_NAME env var
if (!resolvedProfile && process.env.UWF_MODEL_NAME) {
  resolvedModel = resolvedModel ?? process.env.UWF_MODEL_NAME;
  resolvedProfile = matchModelToProfile(process.env.UWF_MODEL_NAME, modelMap);
}

// 5. Default
if (!resolvedProfile) {
  resolvedProfile = defaultProfile;
}

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const profileDef = profileData.profiles[resolvedProfile];
const steeringPolicy = { ...profileDef.steering_policy };

process.stdout.write(
  JSON.stringify(
    {
      profile: resolvedProfile,
      model_name: resolvedModel,
      steering_policy: steeringPolicy,
    },
    null,
    2
  ) + "\n"
);
process.exit(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchModelToProfile(modelName, map) {
  const lower = (modelName ?? "").toLowerCase();
  for (const [profile, patterns] of Object.entries(map)) {
    for (const pattern of patterns ?? []) {
      if (lower.includes(pattern.toLowerCase())) {
        return profile;
      }
    }
  }
  return null;
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
