// Mutation coverage for the release build-provenance boundary validator.
//
// A validator that only ever passes is indistinguishable from no validator at
// all. These tests take the REAL release workflow, apply one targeted mutation
// per case -- the specific edit that would quietly break provenance -- and
// assert the validator rejects it for the right reason. The positive control
// asserts the unmutated file passes, so a validator that had degraded into
// "always fail" would be caught too.
//
// Fixtures are written to a temporary directory, never into .github/workflows:
// a test that wrote a broken workflow into the real directory would leave the
// repository failing its own CI if it aborted midway.
//
// No test performs an attestation. Generating a real Sigstore attestation
// requires the privileged publish workflow and a GitHub OIDC token; that path
// is verified operationally at the next legitimate release, not here.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import {
  APPROVED_ACTION,
  EXPECTED_SUBJECTS,
  PUBLISH_JOB,
  WRAPPER_ACTION,
  parseWorkflow,
  subjectsOf,
  validate,
} from "./validate-release-provenance.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATOR = join("tools", "validate-release-provenance.mjs");
const REAL_WORKFLOW = join(repoRoot, ".github", "workflows", "release-v0.6.yml");
const REAL = readFileSync(REAL_WORKFLOW, "utf8");

/** The pinned attestation step exactly as it appears in the real workflow. */
const ATTEST_STEP_RE =
  /ance for the release assets\n.*\n(?:.*\n)*?.*oh-my-pm-v0\.6\.2-SHA256SUMS\.txt\n/;

const sandboxes = [];

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/**
 * Build a throwaway workflow directory holding the (possibly mutated) release
 * workflow. Extra files simulate a second workflow in the same repository.
 */
function fixture(content, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "omp-provenance-"));
  sandboxes.push(dir);
  const workflows = join(dir, "workflows");
  mkdirSync(workflows, { recursive: true });
  writeFileSync(join(workflows, "release-v0.6.yml"), content);
  for (const [name, body] of Object.entries(extra)) {
    writeFileSync(join(workflows, name), body);
  }
  return workflows;
}

/** Validate a mutated copy of the real workflow. */
function mutated(transform, extra = {}) {
  const dir = fixture(transform(REAL), extra);
  return validate(dir, join(dir, "release-v0.6.yml"));
}

/** Extract the attestation step block from the real workflow. */
function attestBlock() {
  const match = ATTEST_STEP_RE.exec(REAL);
  expect(match, "attestation step must be locatable in the real workflow").not.toBeNull();
  const start = REAL.lastIndexOf("      - name:", match.index);
  return REAL.slice(start, match.index + match[0].length);
}

describe("validate-release-provenance", () => {
  describe("positive control", () => {
    it("accepts the real release workflow unmodified", () => {
      const { failures, summary } = mutated((t) => t);
      expect(failures).toEqual([]);
      expect(summary.attestationSteps).toBe(1);
      expect(summary.action).toBe(APPROVED_ACTION);
      expect(summary.subjects).toEqual([...EXPECTED_SUBJECTS]);
      expect(summary.pinnedSha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("passes against the real repository workflow directory", () => {
      const { failures } = validate(join(repoRoot, ".github", "workflows"));
      expect(failures).toEqual([]);
    });

    it("scopes signing permissions to exactly one job repository-wide", () => {
      const { summary } = validate(join(repoRoot, ".github", "workflows"));
      const jobs = new Set(
        summary.signingJobs.map((entry) => entry.split(":").slice(0, 2).join(":")),
      );
      expect(jobs.size).toBe(1);
      expect([...jobs][0]).toContain(PUBLISH_JOB);
      expect(summary.signingJobs).toHaveLength(2); // id-token + attestations
    });
  });

  describe("rejects missing signing permissions", () => {
    it("rejects a publish job missing id-token: write", () => {
      const { failures } = mutated((t) => t.replace("      id-token: write\n", ""));
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.join("\n")).toMatch(/id-token/i);
    });

    it("rejects a publish job missing attestations: write", () => {
      const { failures } = mutated((t) => t.replace("      attestations: write\n", ""));
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.join("\n")).toMatch(/attestations/i);
    });
  });

  describe("rejects over-broad signing permissions", () => {
    it("rejects workflow-level id-token: write", () => {
      const { failures } = mutated((t) =>
        t.replace(
          "permissions:\n  contents: read\n",
          "permissions:\n  contents: read\n  id-token: write\n",
        ),
      );
      expect(failures.some((f) => /workflow-level "id-token: write"/.test(f))).toBe(true);
    });

    it("rejects workflow-level attestations: write", () => {
      const { failures } = mutated((t) =>
        t.replace(
          "permissions:\n  contents: read\n",
          "permissions:\n  contents: read\n  attestations: write\n",
        ),
      );
      expect(failures.some((f) => /workflow-level "attestations: write"/.test(f))).toBe(true);
    });

    it("rejects a second job receiving id-token: write", () => {
      const { failures } = mutated((t) =>
        t.replace(
          "  prepare:\n    name: Prepare stable release assets\n    runs-on: ubuntu-latest",
          "  prepare:\n    name: Prepare stable release assets\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write",
        ),
      );
      expect(failures.some((f) => /job "prepare" declares "id-token: write"/.test(f))).toBe(true);
    });

    it("rejects the qualification job receiving attestations: write", () => {
      const { failures } = mutated((t) =>
        t.replace(
          "  installed-qualification:\n    name:",
          "  installed-qualification:\n    permissions:\n      attestations: write\n    name:",
        ),
      );
      expect(
        failures.some((f) =>
          /job "installed-qualification" declares "attestations: write"/.test(f),
        ),
      ).toBe(true);
    });

    it("rejects a SECOND workflow receiving id-token: write", () => {
      const { failures } = mutated((t) => t, {
        "other.yml": [
          "name: Other",
          "on: [push]",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    permissions:",
          "      id-token: write",
          "    steps:",
          "      - run: echo hi",
          "",
        ].join("\n"),
      });
      expect(failures.some((f) => /other\.yml/.test(f) && /id-token: write/.test(f))).toBe(true);
    });

    it("rejects a second workflow that also runs an attestation action", () => {
      const { failures } = mutated((t) => t, {
        "other.yml": [
          "name: Other",
          "on: [push]",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          `      - uses: ${APPROVED_ACTION}@${"a".repeat(40)}`,
          "",
        ].join("\n"),
      });
      expect(
        failures.some((f) => /other\.yml/.test(f) && /provenance belongs only to/.test(f)),
      ).toBe(true);
    });
  });

  describe("rejects a bad attestation action reference", () => {
    it("rejects an unpinned attestation action (floating major tag)", () => {
      const { failures } = mutated((t) =>
        t.replace(/actions\/attest@[0-9a-f]{40}/, `${APPROVED_ACTION}@v4`),
      );
      expect(failures.some((f) => /not pinned to a full 40-character/.test(f))).toBe(true);
    });

    it("rejects an attestation action pinned to a branch", () => {
      const { failures } = mutated((t) =>
        t.replace(/actions\/attest@[0-9a-f]{40}/, `${APPROVED_ACTION}@main`),
      );
      expect(failures.some((f) => /not pinned to a full 40-character/.test(f))).toBe(true);
    });

    it("rejects an abbreviated SHA", () => {
      const { failures } = mutated((t) =>
        t.replace(/actions\/attest@[0-9a-f]{40}/, `${APPROVED_ACTION}@1e69f48`),
      );
      expect(failures.some((f) => /not pinned to a full 40-character/.test(f))).toBe(true);
    });

    it("rejects an uppercase SHA", () => {
      const { failures } = mutated((t) =>
        t.replace(
          /actions\/attest@([0-9a-f]{40})/,
          (_m, sha) => `${APPROVED_ACTION}@${sha.toUpperCase()}`,
        ),
      );
      expect(failures.some((f) => /not pinned to a full 40-character/.test(f))).toBe(true);
    });

    it("rejects a non-official third-party attestation action", () => {
      const { failures } = mutated((t) =>
        t.replace(/actions\/attest@/, `evil-org/attest-provenance@`),
      );
      expect(failures.some((f) => /expected the official/.test(f))).toBe(true);
    });

    it("rejects the superseded wrapper action with a pointed message", () => {
      const { failures } = mutated((t) => t.replace(/actions\/attest@/, `${WRAPPER_ACTION}@`));
      expect(failures.some((f) => /wrapper over/.test(f))).toBe(true);
    });
  });

  describe("rejects misplaced attestation steps", () => {
    it("rejects attestation in the prepare job", () => {
      const block = attestBlock();
      const { failures } = mutated((t) =>
        t
          .replace(block, "")
          .replace("      - name: Setup pnpm\n", `${block}      - name: Setup pnpm\n`),
      );
      expect(failures.some((f) => /attestation step is in job "prepare"/.test(f))).toBe(true);
    });

    it("rejects attestation in the installed-qualification job", () => {
      const block = attestBlock();
      const { failures } = mutated((t) =>
        t
          .replace(block, "")
          .replace(
            "      - name: Download prepared release assets\n",
            `${block}      - name: Download prepared release assets\n`,
          ),
      );
      expect(
        failures.some((f) => /attestation step is in job "installed-qualification"/.test(f)),
      ).toBe(true);
    });

    it("rejects a duplicate attestation step", () => {
      const block = attestBlock();
      const { failures } = mutated((t) => t.replace(block, block + block));
      expect(failures.some((f) => /2 attestation steps; exactly one is allowed/.test(f))).toBe(
        true,
      );
    });

    it("rejects a workflow with no attestation step at all", () => {
      const block = attestBlock();
      const { failures } = mutated((t) => t.replace(block, ""));
      expect(failures.some((f) => /no build-provenance attestation step/.test(f))).toBe(true);
    });
  });

  describe("rejects an incorrect subject set", () => {
    const only = (keep) => (t) => {
      const dropped = EXPECTED_SUBJECTS.filter((s) => s !== keep);
      let out = t;
      for (const subject of dropped) out = out.replace(`            ${subject}\n`, "");
      return out;
    };

    it("rejects attesting only the tar.gz", () => {
      const { failures } = mutated(only(EXPECTED_SUBJECTS[0]));
      expect(failures.some((f) => /subjects do not equal the published asset set/.test(f))).toBe(
        true,
      );
    });

    it("rejects attesting only the zip", () => {
      const { failures } = mutated(only(EXPECTED_SUBJECTS[1]));
      expect(failures.some((f) => /subjects do not equal the published asset set/.test(f))).toBe(
        true,
      );
    });

    it("rejects omitting the SHA256SUMS file", () => {
      const { failures } = mutated((t) => t.replace(`            ${EXPECTED_SUBJECTS[2]}\n`, ""));
      expect(failures.some((f) => /missing: .*SHA256SUMS/.test(f))).toBe(true);
    });

    it("rejects an extra fourth subject", () => {
      const { failures } = mutated((t) =>
        t.replace(
          `            ${EXPECTED_SUBJECTS[2]}\n`,
          `            ${EXPECTED_SUBJECTS[2]}\n            release-assets/extra-file.txt\n`,
        ),
      );
      expect(failures.some((f) => /unexpected: release-assets\/extra-file\.txt/.test(f))).toBe(
        true,
      );
    });

    it("rejects a wildcard subject", () => {
      const { failures } = mutated((t) =>
        t.replace(
          EXPECTED_SUBJECTS.map((s) => `            ${s}\n`).join(""),
          "            release-assets/*\n",
        ),
      );
      expect(failures.some((f) => /wildcard/.test(f))).toBe(true);
    });

    it("rejects a glob that would widen the set to the whole tree", () => {
      const { failures } = mutated((t) =>
        t.replace(
          EXPECTED_SUBJECTS.map((s) => `            ${s}\n`).join(""),
          "            **/*\n",
        ),
      );
      expect(failures.some((f) => /wildcard/.test(f))).toBe(true);
    });
  });

  describe("rejects incorrect ordering", () => {
    it("rejects attestation placed before checksum re-verification", () => {
      const block = attestBlock();
      const { failures } = mutated((t) =>
        t
          .replace(block, "")
          .replace(
            "      - name: Re-verify archive checksums\n",
            `${block}      - name: Re-verify archive checksums\n`,
          ),
      );
      expect(failures.some((f) => /BEFORE checksum re-verification/.test(f))).toBe(true);
    });

    it("rejects attestation placed before release preflight completion", () => {
      const block = attestBlock();
      const { failures } = mutated((t) =>
        t
          .replace(block, "")
          .replace(
            "      - name: Ensure tag and release do not already exist\n",
            `${block}      - name: Ensure tag and release do not already exist\n`,
          ),
      );
      expect(failures.some((f) => /BEFORE release preflight step/.test(f))).toBe(true);
    });

    it("rejects attestation placed after the release-creation step", () => {
      const block = attestBlock();
      const { failures } = mutated((t) =>
        t
          .replace(block, "")
          .replace(
            "      - name: Verify published stable release\n",
            `${block}      - name: Verify published stable release\n`,
          ),
      );
      expect(failures.some((f) => /AFTER release creation/.test(f))).toBe(true);
    });
  });

  describe("parser attributes structure correctly", () => {
    it("assigns each permission to its owning job, not to the file", () => {
      const { jobs, workflowPermissions } = parseWorkflow(REAL);
      expect(workflowPermissions).toEqual([
        expect.objectContaining({ name: "contents", value: "read" }),
      ]);
      const publish = jobs.find((j) => j.name === PUBLISH_JOB);
      const names = publish.permissions.map((p) => `${p.name}: ${p.value}`);
      expect(names).toEqual(["contents: write", "id-token: write", "attestations: write"]);
      for (const job of jobs.filter((j) => j.name !== PUBLISH_JOB)) {
        expect(job.permissions.map((p) => p.name)).not.toContain("id-token");
        expect(job.permissions.map((p) => p.name)).not.toContain("attestations");
      }
    });

    it("does not grant artifact-metadata: write anywhere", () => {
      const { jobs, workflowPermissions } = parseWorkflow(REAL);
      const all = [...workflowPermissions, ...jobs.flatMap((j) => j.permissions)];
      expect(all.map((p) => p.name)).not.toContain("artifact-metadata");
    });

    it("recovers block-scalar subject lists", () => {
      const step = {
        with: [
          { text: "subject-path: |", line: 1 },
          { text: "release-assets/a.tar.gz", line: 2 },
          { text: "release-assets/b.zip", line: 3 },
        ],
      };
      expect(subjectsOf(step).subjects).toEqual([
        "release-assets/a.tar.gz",
        "release-assets/b.zip",
      ]);
    });

    it("recovers a single-line subject value", () => {
      const step = { with: [{ text: "subject-path: release-assets/a.tar.gz", line: 1 }] };
      expect(subjectsOf(step).subjects).toEqual(["release-assets/a.tar.gz"]);
    });

    it("reports an absent subject-path rather than silently passing", () => {
      expect(subjectsOf({ with: [] }).present).toBe(false);
    });
  });

  describe("CLI contract", () => {
    it("exits zero against the real workflow directory", () => {
      const output = execFileSync(process.execPath, [VALIDATOR], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(output).toContain("Release provenance OK");
      expect(output).toContain(APPROVED_ACTION);
    });

    it("exits non-zero when the boundary is violated", () => {
      const dir = fixture(REAL.replace("      id-token: write\n", ""));
      expect(() =>
        execFileSync(process.execPath, [VALIDATOR, dir], { cwd: repoRoot, encoding: "utf8" }),
      ).toThrow();
    });
  });
});
