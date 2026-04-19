/**
 * Smoke test: no legacy intake/discovery agent names remain in tracked files.
 *
 * Fails if any of these strings are found in tracked repository files outside of
 * this file itself (which contains them as negative-assertion strings):
 *   - uwf-project_manager-intake
 *   - uwf-sw_dev-intake
 *   - uwf-core-discovery
 *
 * Ignores:
 *   - .git/
 *   - node_modules/
 *   - binary files
 *   - SQLite DB files (*.db)
 *
 * Usage:
 *   node scripts/uwf-smoke/test-no-legacy-intake-discovery-names.mjs
 *
 * Exit codes:
 *   0  no legacy names found
 *   1  one or more legacy names found
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const THIS_FILE = resolve(fileURLToPath(import.meta.url));

// The legacy names to search for
const FORBIDDEN_NAMES = [
  "uwf-project_manager-intake",
  "uwf-sw_dev-intake",
  "uwf-core-discovery",
];

// Directories to skip entirely
const SKIP_DIRS = new Set([".git", "node_modules", "uwf-companion"]);

// File extensions to skip (binary / DB)
const SKIP_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot"]);

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function shouldSkipFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

function isThisFile(filePath) {
  return resolve(filePath) === THIS_FILE;
}

function walkDir(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        walkDir(fullPath, results);
      }
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = walkDir(REPO_ROOT);

let violations = [];

for (const filePath of allFiles) {
  if (shouldSkipFile(filePath)) continue;
  if (isThisFile(filePath)) continue;

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    // Skip files that can't be read as UTF-8
    continue;
  }

  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      violations.push({ file: relative(REPO_ROOT, filePath), name });
    }
  }
}

console.log("\nSmoke test: no legacy intake/discovery agent names\n");

if (violations.length === 0) {
  console.log("  ✓ No legacy names found in tracked files.");
  console.log(`\n${"─".repeat(50)}`);
  console.log("Results: 1 passed, 0 failed");
  process.exit(0);
} else {
  console.error("  ✗ Legacy names found in the following files:");
  for (const { file, name } of violations) {
    console.error(`    ${file}: "${name}"`);
  }
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: 0 passed, ${violations.length} failed`);
  process.exit(1);
}
