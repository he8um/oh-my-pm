// Mutation coverage for the GitHub Action pin validator.
//
// A validator that only ever passes is indistinguishable from no validator at
// all. These tests build throwaway workflow directories containing each ref
// form the policy claims to reject, run the validator against them, and assert
// it fails for the right reason -- then assert it accepts the forms that are
// legitimately allowed.
//
// Fixtures are written to a temporary directory, never into
// .github/workflows: a test that wrote an unpinned action into the real
// workflow directory would leave the repository failing its own CI if it
// aborted midway.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { classifyUses, validate } from "./validate-action-pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATOR = join("tools", "validate-action-pins.mjs");

/** A real, verified pin from the repository -- the known-good control. */
const GOOD_SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";

const sandboxes = [];

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway workflow directory containing a single step with `uses: <ref>`. */
function fixture(usesValue) {
  const dir = mkdtempSync(join(tmpdir(), "omp-action-pins-"));
  sandboxes.push(dir);
  const workflows = join(dir, "workflows");
  mkdirSync(workflows, { recursive: true });
  writeFileSync(
    join(workflows, "fixture.yml"),
    [
      "name: Fixture",
      "on: [push]",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Step",
      `        uses: ${usesValue}`,
      "",
    ].join("\n"),
  );
  return workflows;
}

/** Reject cases: every mutable or malformed external ref the policy forbids. */
const REJECTED = [
  ["floating major tag", "actions/checkout@v5"],
  ["exact version tag", "actions/checkout@v5.1.0"],
  ["main branch", "owner/action@main"],
  ["master branch", "owner/action@master"],
  ["stable branch", "dtolnay/rust-toolchain@stable"],
  ["abbreviated SHA", "owner/action@abc1234"],
  ["39-character SHA", `owner/action@${"a".repeat(39)}`],
  ["41-character SHA", `owner/action@${"a".repeat(41)}`],
  ["uppercase SHA", `owner/action@${GOOD_SHA.toUpperCase()}`],
  ["non-hex 40-character ref", `owner/action@${"g".repeat(40)}`],
  ["feature branch", "owner/action@feature-branch"],
  ["missing ref entirely", "owner/action"],
];

describe("validate-action-pins", () => {
  describe("rejects mutable external references", () => {
    for (const [label, usesValue] of REJECTED) {
      it(`rejects ${label}: ${usesValue}`, () => {
        const { failures } = validate(fixture(usesValue));
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain(usesValue);
      });
    }
  });

  describe("accepts legitimate references", () => {
    it("accepts a full 40-character lowercase commit SHA", () => {
      const { occurrences, failures } = validate(fixture(`actions/checkout@${GOOD_SHA}`));
      expect(failures).toEqual([]);
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].pinned).toBe(true);
    });

    it("accepts a pinned action carrying a trailing version comment", () => {
      const { failures } = validate(fixture(`actions/checkout@${GOOD_SHA}  # v5.1.0`));
      expect(failures).toEqual([]);
    });

    it("accepts a pinned action with a subdirectory path", () => {
      const { failures } = validate(fixture(`owner/repo/sub/action@${GOOD_SHA}`));
      expect(failures).toEqual([]);
    });

    it("accepts a local relative action path", () => {
      const { occurrences, failures } = validate(fixture("./.github/actions/example"));
      expect(failures).toEqual([]);
      expect(occurrences[0].kind).toBe("local");
    });

    it("accepts a local reusable workflow path", () => {
      const { failures } = validate(fixture("./.github/workflows/reusable.yml"));
      expect(failures).toEqual([]);
    });

    it("does not classify a local path as a third-party action", () => {
      expect(classifyUses("./.github/actions/example").kind).toBe("local");
      expect(classifyUses("../shared/action").kind).toBe("local");
      expect(classifyUses("actions/checkout@v5").kind).toBe("external");
    });
  });

  it("reports a docker:// reference rather than silently exempting it", () => {
    const { failures } = validate(fixture("docker://alpine:3.19"));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("docker://");
  });

  it("flags every unpinned reference in a file, not just the first", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-action-pins-multi-"));
    sandboxes.push(dir);
    const workflows = join(dir, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeFileSync(
      join(workflows, "multi.yml"),
      [
        "jobs:",
        "  build:",
        "    steps:",
        "      - uses: actions/checkout@v5",
        `      - uses: actions/setup-node@${GOOD_SHA}`,
        "      - uses: owner/action@main",
        "",
      ].join("\n"),
    );
    const { occurrences, failures } = validate(workflows);
    expect(occurrences).toHaveLength(3);
    expect(failures).toHaveLength(2);
  });

  it("scans .yaml as well as .yml", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-action-pins-yaml-"));
    sandboxes.push(dir);
    const workflows = join(dir, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeFileSync(
      join(workflows, "fixture.yaml"),
      "jobs:\n  b:\n    steps:\n      - uses: owner/action@main\n",
    );
    expect(validate(workflows).failures).toHaveLength(1);
  });

  it("passes against the real repository workflows", () => {
    const { occurrences, failures } = validate(join(repoRoot, ".github", "workflows"));
    expect(failures).toEqual([]);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((u) => u.kind !== "external" || u.pinned)).toBe(true);
  });

  it("exits non-zero as a CLI when a workflow is unpinned", () => {
    const workflows = fixture("actions/checkout@v5");
    expect(() =>
      execFileSync(process.execPath, [VALIDATOR, workflows], { cwd: repoRoot, encoding: "utf8" }),
    ).toThrow();
  });

  it("exits zero as a CLI against the real workflow directory", () => {
    const output = execFileSync(process.execPath, [VALIDATOR], { cwd: repoRoot, encoding: "utf8" });
    expect(output).toContain("0 unpinned");
  });
});
