import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RELEASE_ARCHIVE_BUNDLE_NAME,
  RELEASE_ARCHIVE_SUMS_NAME,
  RELEASE_ARCHIVE_TAR_NAME,
  RELEASE_ARCHIVE_VERSION,
  RELEASE_ARCHIVE_ZIP_NAME,
  applyReleaseArchivePlan,
  formatReleaseArchivePlan,
  parseReleaseArchiveArgs,
  resolveReleaseArchivePlan,
  sha256File,
} from "./release-archive-utils.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];
let bundle;

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

beforeAll(() => {
  const bundleRoot = tempDir("oh-my-pm-arch-bundle-");
  const build = spawnSync(
    process.execPath,
    [join(repoRoot, "tools", "build-release-bundle.mjs"), "--output", bundleRoot, "--apply"],
    { encoding: "utf8" },
  );
  expect(build.status, build.stderr).toBe(0);
  bundle = join(bundleRoot, RELEASE_ARCHIVE_BUNDLE_NAME);
}, 180_000);

afterAll(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("constants", () => {
  it("derives canonical names from version.json", () => {
    expect(RELEASE_ARCHIVE_VERSION).toBe("0.1.0");
    expect(RELEASE_ARCHIVE_BUNDLE_NAME).toBe("oh-my-pm-v0.1.0");
    expect(RELEASE_ARCHIVE_TAR_NAME).toBe("oh-my-pm-v0.1.0.tar.gz");
    expect(RELEASE_ARCHIVE_ZIP_NAME).toBe("oh-my-pm-v0.1.0.zip");
    expect(RELEASE_ARCHIVE_SUMS_NAME).toBe("oh-my-pm-v0.1.0-SHA256SUMS.txt");
  });
});

describe("parseReleaseArchiveArgs", () => {
  it("requires bundle and output", () => {
    expect(parseReleaseArchiveArgs([])).toMatchObject({ ok: false });
    expect(parseReleaseArchiveArgs(["--bundle", "a"])).toMatchObject({ ok: false });
    expect(parseReleaseArchiveArgs(["--output", "b"])).toMatchObject({ ok: false });
  });

  it("rejects duplicates, unknown options, positionals, and force without apply", () => {
    expect(parseReleaseArchiveArgs(["--bundle", "a", "--bundle", "c", "--output", "b"])).toMatchObject({ ok: false });
    expect(parseReleaseArchiveArgs(["--bundle", "a", "--output", "b", "--bad"])).toMatchObject({ ok: false });
    expect(parseReleaseArchiveArgs(["--bundle", "a", "--output", "b", "x"])).toMatchObject({ ok: false });
    expect(parseReleaseArchiveArgs(["--bundle", "a", "--output", "b", "--force"])).toMatchObject({ ok: false });
  });

  it("accepts apply, force, and json and defaults to brief preview", () => {
    expect(parseReleaseArchiveArgs(["--bundle", "a", "--output", "b"])).toEqual({
      ok: true,
      bundle: "a",
      output: "b",
      apply: false,
      force: false,
      outputMode: "brief",
    });
    expect(
      parseReleaseArchiveArgs(["--bundle", "a", "--output", "b", "--apply", "--force", "--json"]),
    ).toEqual({ ok: true, bundle: "a", output: "b", apply: true, force: true, outputMode: "json" });
  });
});

describe("resolveReleaseArchivePlan", () => {
  it("plans exact target names and a create action for a valid bundle", () => {
    const plan = resolveReleaseArchivePlan({ bundle, output: tempDir("oh-my-pm-arch-out-") });
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe("create");
    expect(plan.tarPath.endsWith("oh-my-pm-v0.1.0.tar.gz")).toBe(true);
    expect(plan.zipPath.endsWith("oh-my-pm-v0.1.0.zip")).toBe(true);
    expect(plan.sumsPath.endsWith("oh-my-pm-v0.1.0-SHA256SUMS.txt")).toBe(true);
  });

  it("blocks a missing bundle and a wrong basename", () => {
    expect(resolveReleaseArchivePlan({ bundle: join(repoRoot, "nope"), output: tempDir("o-") })).toMatchObject({ ok: false, action: "blocked" });
    // Wrong basename: point at the repo root itself.
    const wrong = resolveReleaseArchivePlan({ bundle: repoRoot, output: tempDir("o-") });
    expect(wrong.ok).toBe(false);
    expect(wrong.reasons.some((r) => r.includes("bundle_basename"))).toBe(true);
  });

  it("blocks when an exact asset already exists, replaces with force, ignores unrelated files, writes nothing", () => {
    const out = tempDir("oh-my-pm-arch-exist-");
    writeFileSync(join(out, RELEASE_ARCHIVE_TAR_NAME), "stub", "utf8");
    writeFileSync(join(out, "unrelated.txt"), "keep", "utf8");
    const blocked = resolveReleaseArchivePlan({ bundle, output: out });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons).toContain("release_archive_exists");
    const replace = resolveReleaseArchivePlan({ bundle, output: out, apply: true, force: true });
    expect(replace.action).toBe("replace");
    // Plan performed no writes and did not remove the unrelated file.
    expect(existsSync(join(out, "unrelated.txt"))).toBe(true);
    expect(existsSync(join(out, RELEASE_ARCHIVE_ZIP_NAME))).toBe(false);
  });
});

describe("applyReleaseArchivePlan", () => {
  it("creates exactly three assets and leaves the source bundle unchanged", () => {
    const out = tempDir("oh-my-pm-arch-apply-");
    const before = spawnSync(
      process.execPath,
      [join(repoRoot, "tools", "check-release-bundle.mjs"), "--bundle", bundle],
      { encoding: "utf8" },
    );
    expect(before.status).toBe(0);

    const plan = resolveReleaseArchivePlan({ bundle, output: out, apply: true });
    const result = applyReleaseArchivePlan(plan);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(readdirSync(out).sort()).toEqual(
      [RELEASE_ARCHIVE_SUMS_NAME, RELEASE_ARCHIVE_TAR_NAME, RELEASE_ARCHIVE_ZIP_NAME].sort(),
    );

    // Source bundle still verifies (unchanged).
    const after = spawnSync(
      process.execPath,
      [join(repoRoot, "tools", "check-release-bundle.mjs"), "--bundle", bundle],
      { encoding: "utf8" },
    );
    expect(after.status).toBe(0);

    // No temporary workspace left behind.
    expect(readdirSync(out).some((n) => n.includes(".archive.tmp-"))).toBe(false);
  }, 120_000);

  it("refuses when apply is not requested or the plan is not applicable", () => {
    const preview = resolveReleaseArchivePlan({ bundle, output: tempDir("o-") });
    expect(applyReleaseArchivePlan(preview)).toMatchObject({ ok: false, code: "apply_not_requested" });
  });

  it("writes a sorted two-line checksum file", () => {
    const out = tempDir("oh-my-pm-arch-sums-");
    applyReleaseArchivePlan(resolveReleaseArchivePlan({ bundle, output: out, apply: true }));
    const sums = readFileSync(join(out, RELEASE_ARCHIVE_SUMS_NAME), "utf8");
    const lines = sums.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe("");
    expect(lines[0]).toMatch(/^[0-9a-f]{64} {2}oh-my-pm-v0\.1\.0\.tar\.gz$/);
    expect(lines[1]).toMatch(/^[0-9a-f]{64} {2}oh-my-pm-v0\.1\.0\.zip$/);
    expect(sha256File(join(out, RELEASE_ARCHIVE_TAR_NAME))).toBe(lines[0].slice(0, 64));
  }, 120_000);
});

describe("formatReleaseArchivePlan", () => {
  it("renders a preview and valid JSON without the internal gnuTar field", () => {
    const plan = resolveReleaseArchivePlan({ bundle, output: tempDir("o-") });
    const preview = formatReleaseArchivePlan(plan, "brief");
    expect(preview).toContain("OH MY PM release archives: preview");
    expect(preview).toContain("apply required: yes");
    const json = formatReleaseArchivePlan(plan, "json");
    const parsed = JSON.parse(json);
    expect(parsed.gnuTar).toBeUndefined();
    expect(json.endsWith("\n")).toBe(true);
  });
});
