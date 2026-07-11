import type { InstallManifest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import type { LocalUpdatePolicy, LocalUpdatePolicyInput } from "../src/index.js";
import {
  compareVersionStrings,
  createLocalUpdatePolicyDryRun,
  DEFAULT_LOCAL_UPDATE_POLICY,
  evaluateLocalUpdatePolicy,
  exampleLocalUpdatePolicyInput,
  selectUpdateCandidate,
  validateLocalUpdatePolicy,
  validateUpdatePolicyMode,
} from "../src/index.js";

const installed = (version: string): InstallManifest => ({
  schemaVersion: "1",
  version,
  installedAt: "2026-01-01T00:00:00.000Z",
  root: "/tmp/oh-my-pm",
});

const input = (overrides: Partial<LocalUpdatePolicyInput> = {}): LocalUpdatePolicyInput => ({
  ...exampleLocalUpdatePolicyInput(),
  ...overrides,
});

const policyWith = (overrides: Partial<LocalUpdatePolicy>): LocalUpdatePolicy => ({
  ...DEFAULT_LOCAL_UPDATE_POLICY,
  ...overrides,
});

describe("validateUpdatePolicyMode", () => {
  it("accepts manual and automatic only", () => {
    expect(validateUpdatePolicyMode("manual")).toBe(true);
    expect(validateUpdatePolicyMode("automatic")).toBe(true);
    expect(validateUpdatePolicyMode("scheduled")).toBe(false);
    expect(validateUpdatePolicyMode("")).toBe(false);
  });
});

describe("validateLocalUpdatePolicy", () => {
  it("accepts the default policy", () => {
    expect(validateLocalUpdatePolicy(DEFAULT_LOCAL_UPDATE_POLICY)).toEqual([]);
  });

  it("reports mode, empty channels, and invalid channels in order", () => {
    const reasons = validateLocalUpdatePolicy({
      mode: "eager" as never,
      allowedChannels: [],
      allowDowngrade: false,
      requireIntegrity: true,
    });
    expect(reasons).toEqual([
      "update_policy_mode_invalid",
      "update_policy_allowed_channels_empty",
    ]);
  });

  it("reports an invalid allowed channel", () => {
    expect(
      validateLocalUpdatePolicy(policyWith({ allowedChannels: ["stable", "canary" as never] })),
    ).toEqual(["update_policy_allowed_channel_invalid"]);
  });
});

describe("selectUpdateCandidate and compareVersionStrings", () => {
  it("returns the latest channel entry", () => {
    expect(selectUpdateCandidate(input())?.version).toBe("2.0.0-alpha.0");
  });

  it("returns undefined for an empty channel without mutating it", () => {
    const empty = input();
    empty.channel = { ...empty.channel, entries: [] };
    const snapshot = { ...empty.channel };
    expect(selectUpdateCandidate(empty)).toBeUndefined();
    expect(empty.channel).toEqual(snapshot);
  });

  it("compares versions deterministically", () => {
    expect(compareVersionStrings("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersionStrings("2.0.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersionStrings("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("evaluateLocalUpdatePolicy", () => {
  it("allows the newer fixture candidate", () => {
    const report = evaluateLocalUpdatePolicy(input());
    expect(report).toEqual({
      ok: true,
      decision: "allowed",
      channel: "dev",
      reasons: [],
      currentVersion: "1.0.0",
      candidateVersion: "2.0.0-alpha.0",
    });
  });

  it("blocks when the installed manifest is missing", () => {
    const report = evaluateLocalUpdatePolicy(input({ installed: undefined }));
    expect(report.decision).toBe("blocked");
    expect(report.reasons).toEqual(["installed_manifest_missing"]);
    expect("currentVersion" in report).toBe(false);
    expect(report.candidateVersion).toBe("2.0.0-alpha.0");
  });

  it("blocks for an invalid policy", () => {
    const report = evaluateLocalUpdatePolicy(input({ policy: policyWith({ allowedChannels: [] }) }));
    expect(report.reasons).toEqual(["update_policy_invalid"]);
  });

  it("blocks a channel outside the allow list", () => {
    const report = evaluateLocalUpdatePolicy(input({ policy: policyWith({ allowedChannels: ["stable"] }) }));
    expect(report.reasons).toEqual(["channel_not_allowed"]);
  });

  it("blocks when no candidate exists", () => {
    const empty = input();
    empty.channel = { ...empty.channel, entries: [] };
    const report = evaluateLocalUpdatePolicy(empty);
    expect(report.reasons).toEqual(["candidate_missing"]);
    expect("candidateVersion" in report).toBe(false);
  });

  it("blocks on failed integrity when required, allows when not", () => {
    const broken = input();
    broken.channel = {
      ...broken.channel,
      entries: broken.channel.entries.map((entry) => ({
        ...entry,
        integrity: { ...entry.integrity, ok: false },
      })),
    };
    expect(evaluateLocalUpdatePolicy(broken).reasons).toEqual(["candidate_integrity_failed"]);

    const relaxed = { ...broken, policy: policyWith({ requireIntegrity: false }) };
    expect(evaluateLocalUpdatePolicy(relaxed).decision).toBe("allowed");
  });

  it("blocks a candidate with a missing version", () => {
    const broken = input();
    broken.channel = {
      ...broken.channel,
      entries: broken.channel.entries.map((entry) => ({ ...entry, version: " " })),
    };
    expect(evaluateLocalUpdatePolicy(broken).reasons).toEqual(["candidate_version_missing"]);
  });

  it("returns already-current when versions match", () => {
    const report = evaluateLocalUpdatePolicy(input({ installed: installed("2.0.0-alpha.0") }));
    expect(report.ok).toBe(true);
    expect(report.decision).toBe("already-current");
    expect(report.reasons).toEqual(["candidate_already_installed"]);
  });

  it("blocks a downgrade unless allowed", () => {
    const blocked = evaluateLocalUpdatePolicy(input({ installed: installed("9.0.0") }));
    expect(blocked.decision).toBe("blocked");
    expect(blocked.reasons).toEqual(["candidate_downgrade_blocked"]);

    const allowed = evaluateLocalUpdatePolicy(
      input({ installed: installed("9.0.0"), policy: policyWith({ allowDowngrade: true }) }),
    );
    expect(allowed.decision).toBe("allowed");
    expect(allowed.reasons).toEqual([]);
  });
});

describe("createLocalUpdatePolicyDryRun", () => {
  it("returns ok true without warnings for an allowed update", () => {
    const report = createLocalUpdatePolicyDryRun(input());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked update", () => {
    const report = createLocalUpdatePolicyDryRun(input({ installed: undefined }));
    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "installed_manifest_missing" },
    ]);
  });
});

describe("exampleLocalUpdatePolicyInput", () => {
  it("is deterministic and dry-runs to an allowed decision", () => {
    expect(exampleLocalUpdatePolicyInput()).toEqual(exampleLocalUpdatePolicyInput());
    const report = createLocalUpdatePolicyDryRun(exampleLocalUpdatePolicyInput());
    expect(report.ok).toBe(true);
    expect(report.report.decision).toBe("allowed");
  });
});
