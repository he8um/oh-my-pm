import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  RELEASE_BUNDLE_NAME,
  RELEASE_BUNDLE_VERSION,
  formatReleaseBundlePlan,
  parseReleaseBundleArgs,
  resolveReleaseBundlePlan,
} from "../release-bundle-utils.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputs = [];

function makeOutput() {
  const dir = mkdtempSync(join(tmpdir(), "oh-my-pm-bundle-utils-"));
  outputs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of outputs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("constants", () => {
  it("pins the canonical version and bundle name", () => {
    expect(RELEASE_BUNDLE_VERSION).toBe("0.1.0");
    expect(RELEASE_BUNDLE_NAME).toBe("oh-my-pm-v0.1.0");
  });
});

describe("parseReleaseBundleArgs", () => {
  it("requires --output", () => {
    expect(parseReleaseBundleArgs([])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--apply"])).toMatchObject({ ok: false });
  });

  it("rejects a missing or duplicate output value", () => {
    expect(parseReleaseBundleArgs(["--output"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "--output", "b"])).toMatchObject({ ok: false });
  });

  it("rejects unknown options, positionals, and force without apply", () => {
    expect(parseReleaseBundleArgs(["--output", "a", "--bad"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "x"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "--force"])).toMatchObject({ ok: false });
  });

  it("accepts apply, force, and json", () => {
    expect(parseReleaseBundleArgs(["--output", "a", "--apply", "--force", "--json"])).toEqual({
      ok: true,
      output: "a",
      apply: true,
      force: true,
      outputMode: "json",
    });
  });
});

describe("resolveReleaseBundlePlan", () => {
  it("reports a create action for a fresh output and lists prerequisites", () => {
    const plan = resolveReleaseBundlePlan({ output: makeOutput() });
    expect(plan.version).toBe("0.1.0");
    expect(plan.bundleName).toBe("oh-my-pm-v0.1.0");
    expect(plan.prerequisites.length).toBeGreaterThan(10);
    // The workspace is built during the suite, so prerequisites should exist.
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe("create");
  });

  it("blocks when the target bundle already exists without force", () => {
    const output = makeOutput();
    mkdirSync(join(output, RELEASE_BUNDLE_NAME), { recursive: true });
    const plan = resolveReleaseBundlePlan({ output });
    expect(plan.ok).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons).toContain("release_bundle_exists");
  });

  it("replaces when the target exists with force", () => {
    const output = makeOutput();
    mkdirSync(join(output, RELEASE_BUNDLE_NAME), { recursive: true });
    const plan = resolveReleaseBundlePlan({ output, apply: true, force: true });
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe("replace");
  });

  it("resolves prerequisite targets from the repository root and writes nothing", () => {
    const output = makeOutput();
    const plan = resolveReleaseBundlePlan({ output });
    for (const prerequisite of plan.prerequisites) {
      expect(prerequisite.path.startsWith(repoRoot)).toBe(true);
    }
    expect(existsSync(join(output, RELEASE_BUNDLE_NAME))).toBe(false);
  });
});

describe("formatReleaseBundlePlan", () => {
  it("renders a preview and valid JSON", () => {
    const plan = resolveReleaseBundlePlan({ output: makeOutput() });
    const preview = formatReleaseBundlePlan(plan, "brief");
    expect(preview).toContain("OH MY PM release bundle: preview");
    expect(preview).toContain("apply required: yes");
    const json = formatReleaseBundlePlan(plan, "json");
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.endsWith("\n")).toBe(true);
  });
});
