#!/usr/bin/env node
// Read-only documentation inventory.
//
// Reports what the repository's documentation actually consists of, grouped by
// the classification in docs/manifest.json:
//
//   active normative     may be cited as current truth
//   active informative   explanatory; not a truth source
//   historical           point-in-time records, frozen
//   superseded           replaced; kept as evidence
//   release records      published release notes and validation records
//   broken replacements  a replacement path that does not resolve
//   unclassified         a tracked document the manifest does not cover
//
// The last two are the ones that matter operationally: an unclassified document
// is unchecked by validate-doc-truth (so it can drift freely), and a broken
// replacement is a dangling pointer a reader would follow to nothing.
//
// Deterministic: entries are sorted, so the output is stable across machines and
// diffable in CI. Offline and read-only -- no network, no writes.
//
// Usage:
//   node tools/docs-inventory.mjs            human-readable report
//   node tools/docs-inventory.mjs --json     machine-readable
//   node tools/docs-inventory.mjs --strict   exit non-zero on any defect

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";
import { loadDocsManifest, isExcluded, classificationOf } from "./docs-manifest.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const strict = args.includes("--strict");

/** Every tracked Markdown document, from git so untracked scratch files are ignored. */
function trackedMarkdown() {
  const out = execFileSync("git", ["ls-files", "*.md"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter((line) => line.length > 0);
}

const { manifest, errors } = loadDocsManifest(REPO_ROOT);
if (manifest === null) {
  for (const message of errors) console.error(`FAIL: ${message}`);
  process.exit(1);
}

const tracked = trackedMarkdown().sort();

const buckets = {
  activeNormative: [],
  activeInformative: [],
  historical: [],
  superseded: [],
  releaseRecords: [],
  unclassified: [],
  brokenReplacements: [],
  missingFiles: [],
};

for (const doc of [...manifest.documents].sort((a, b) => a.path.localeCompare(b.path))) {
  if (doc.status === "active") {
    if (doc.authority === "normative") buckets.activeNormative.push(doc.path);
    else buckets.activeInformative.push(doc.path);
  } else if (doc.status === "historical") {
    buckets.historical.push(doc.path);
  } else if (doc.status === "superseded") {
    buckets.superseded.push(doc.path);
  } else if (doc.status === "release-record") {
    buckets.releaseRecords.push(doc.path);
  }

  if (!existsSync(join(REPO_ROOT, doc.path))) {
    buckets.missingFiles.push(doc.path);
  }
  if (typeof doc.replacement === "string" && !existsSync(join(REPO_ROOT, doc.replacement))) {
    buckets.brokenReplacements.push(`${doc.path} -> ${doc.replacement}`);
  }
}

for (const rel of tracked) {
  if (isExcluded(manifest, rel)) continue;
  if (classificationOf(manifest, rel) === null) buckets.unclassified.push(rel);
}

// Structural manifest errors are defects too, so --strict sees them.
const defectCount =
  buckets.unclassified.length +
  buckets.brokenReplacements.length +
  buckets.missingFiles.length +
  errors.length;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        totals: {
          tracked: tracked.length,
          classified: manifest.documents.length,
          activeNormative: buckets.activeNormative.length,
          activeInformative: buckets.activeInformative.length,
          historical: buckets.historical.length,
          superseded: buckets.superseded.length,
          releaseRecords: buckets.releaseRecords.length,
          unclassified: buckets.unclassified.length,
          brokenReplacements: buckets.brokenReplacements.length,
          missingFiles: buckets.missingFiles.length,
          manifestErrors: errors.length,
        },
        ...buckets,
        manifestErrors: errors,
      },
      null,
      2,
    ),
  );
} else {
  const section = (title, entries) => {
    console.log(`\n${title} (${entries.length})`);
    for (const entry of entries) console.log(`  ${entry}`);
    if (entries.length === 0) console.log("  (none)");
  };

  console.log("OH MY PM documentation inventory");
  console.log(`tracked Markdown: ${tracked.length}   classified: ${manifest.documents.length}`);
  section("active normative", buckets.activeNormative);
  section("active informative", buckets.activeInformative);
  section("historical", buckets.historical);
  section("superseded", buckets.superseded);
  section("release records", buckets.releaseRecords);
  section("broken replacements", buckets.brokenReplacements);
  section("classified but missing", buckets.missingFiles);
  section("unclassified", buckets.unclassified);
  if (errors.length > 0) section("manifest errors", errors);
}

if (strict && defectCount > 0) {
  console.error(`\ndocs-inventory: FAILED (${defectCount} defect(s))`);
  process.exit(1);
}
