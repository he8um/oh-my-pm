import { describe, expect, it } from "vitest";
import type { ReleaseChannelEntry, ReleaseChannelMetadata } from "../src/index.js";
import {
  compareReleaseChannelEntries,
  createReleaseChannelDryRun,
  createReleaseChannelMetadata,
  exampleReleaseChannelMetadataInput,
  RELEASE_CHANNEL_SCHEMA_VERSION,
  selectLatestReleaseChannelEntry,
  validateReleaseChannelMetadata,
  validateReleaseChannelName,
} from "../src/index.js";

const baseEntry = (): ReleaseChannelEntry => exampleReleaseChannelMetadataInput().entries[0];

const entryWith = (version: string, createdAt: string): ReleaseChannelEntry => ({
  ...baseEntry(),
  version,
  createdAt,
});

const validChannel = (): ReleaseChannelMetadata =>
  createReleaseChannelMetadata(exampleReleaseChannelMetadataInput());

describe("validateReleaseChannelName", () => {
  it("accepts only the four supported channels", () => {
    for (const name of ["stable", "beta", "nightly", "dev"]) {
      expect(validateReleaseChannelName(name)).toBe(true);
    }
    expect(validateReleaseChannelName("canary")).toBe(false);
    expect(validateReleaseChannelName("")).toBe(false);
  });
});

describe("compareReleaseChannelEntries and selectLatest", () => {
  it("compares createdAt first, then version", () => {
    const older = entryWith("9.0.0", "2026-01-01T00:00:00.000Z");
    const newer = entryWith("1.0.0", "2026-02-01T00:00:00.000Z");
    expect(compareReleaseChannelEntries(older, newer)).toBeLessThan(0);
    expect(compareReleaseChannelEntries(newer, older)).toBeGreaterThan(0);

    const tieA = entryWith("2.0.0-alpha.0", "2026-01-01T00:00:00.000Z");
    const tieB = entryWith("2.0.0-alpha.1", "2026-01-01T00:00:00.000Z");
    expect(compareReleaseChannelEntries(tieA, tieB)).toBeLessThan(0);
    expect(compareReleaseChannelEntries(tieA, entryWith(tieA.version, tieA.createdAt))).toBe(0);
  });

  it("selects the latest without mutating input", () => {
    const entries = [
      entryWith("1.0.0", "2026-01-01T00:00:00.000Z"),
      entryWith("3.0.0", "2026-03-01T00:00:00.000Z"),
      entryWith("2.0.0", "2026-02-01T00:00:00.000Z"),
    ];
    const snapshot = entries.map((entry) => entry.version);
    expect(selectLatestReleaseChannelEntry(entries)?.version).toBe("3.0.0");
    expect(entries.map((entry) => entry.version)).toEqual(snapshot);
    expect(selectLatestReleaseChannelEntry([])).toBeUndefined();
  });
});

describe("createReleaseChannelMetadata", () => {
  it("sorts entries newest first and selects latestVersion", () => {
    const channel = createReleaseChannelMetadata({
      channel: "dev",
      entries: [
        entryWith("1.0.0", "2026-01-01T00:00:00.000Z"),
        entryWith("2.0.0", "2026-02-01T00:00:00.000Z"),
      ],
    });
    expect(channel.schemaVersion).toBe(RELEASE_CHANNEL_SCHEMA_VERSION);
    expect(channel.latestVersion).toBe("2.0.0");
    expect(channel.entries.map((entry) => entry.version)).toEqual(["2.0.0", "1.0.0"]);
  });

  it("clones entries and handles empty input", () => {
    const entries = [baseEntry()];
    const channel = createReleaseChannelMetadata({ channel: "dev", entries });
    entries[0].version = "mutated";
    expect(channel.entries[0].version).toBe("2.0.0-alpha.0");

    const empty = createReleaseChannelMetadata({ channel: "dev", entries: [] });
    expect(empty.latestVersion).toBe("");
    expect(empty.entries).toEqual([]);
  });

  it("exposes no remote or artifact fields", () => {
    const channel = validChannel();
    expect(Object.keys(channel).sort()).toEqual([
      "channel",
      "entries",
      "latestVersion",
      "schemaVersion",
    ]);
    for (const key of Object.keys(channel.entries[0])) {
      expect(key).not.toMatch(/url|endpoint|remote|artifactPath/i);
    }
  });
});

describe("validateReleaseChannelMetadata", () => {
  it("passes a valid channel", () => {
    expect(validateReleaseChannelMetadata(validChannel())).toEqual({ ok: true, reasons: [] });
  });

  it("reports an invalid channel name", () => {
    const channel = { ...validChannel(), channel: "canary" as never };
    expect(validateReleaseChannelMetadata(channel).reasons).toEqual(["release_channel_invalid"]);
  });

  it("reports empty entries and missing latest version together", () => {
    const channel = createReleaseChannelMetadata({ channel: "dev", entries: [] });
    expect(validateReleaseChannelMetadata(channel).reasons).toEqual([
      "release_channel_latest_version_missing",
      "release_channel_entries_must_not_be_empty",
    ]);
  });

  it("reports entry version, createdAt, metadata, and integrity problems in order", () => {
    const broken = validChannel();
    broken.entries[0].version = " ";
    broken.entries[0].createdAt = "";
    broken.entries[0].metadata = { ...broken.entries[0].metadata, packageName: "" };
    broken.entries[0].integrity = { ...broken.entries[0].integrity, ok: false };
    const reasons = validateReleaseChannelMetadata(broken).reasons;
    expect(reasons).toEqual([
      "release_channel_entry_version_missing",
      "release_channel_entry_created_at_missing",
      "release_channel_entry_metadata_invalid",
      "release_channel_entry_integrity_failed",
      "release_channel_latest_version_mismatch",
    ]);
  });

  it("reports a latest version mismatch", () => {
    const channel = { ...validChannel(), latestVersion: "9.9.9" };
    expect(validateReleaseChannelMetadata(channel).reasons).toEqual([
      "release_channel_latest_version_mismatch",
    ]);
  });

  it("reports duplicate versions once", () => {
    const channel = createReleaseChannelMetadata({
      channel: "dev",
      entries: [
        entryWith("1.0.0", "2026-01-01T00:00:00.000Z"),
        entryWith("1.0.0", "2026-01-01T00:00:00.000Z"),
        entryWith("1.0.0", "2026-01-01T00:00:00.000Z"),
      ],
    });
    expect(validateReleaseChannelMetadata(channel).reasons).toEqual([
      "duplicate_release_channel_entry_version",
    ]);
  });
});

describe("createReleaseChannelDryRun", () => {
  it("returns ok true without warnings for valid input", () => {
    const report = createReleaseChannelDryRun(exampleReleaseChannelMetadataInput());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for invalid input", () => {
    const report = createReleaseChannelDryRun({ channel: "dev", entries: [] });
    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "release_channel_latest_version_missing" },
      { code: "OMP-I-6001", message: "release_channel_entries_must_not_be_empty" },
    ]);
  });
});

describe("exampleReleaseChannelMetadataInput", () => {
  it("is deterministic and dry-runs ok with the expected latest version", () => {
    expect(exampleReleaseChannelMetadataInput()).toEqual(exampleReleaseChannelMetadataInput());
    const report = createReleaseChannelDryRun(exampleReleaseChannelMetadataInput());
    expect(report.ok).toBe(true);
    expect(report.channel.channel).toBe("dev");
    expect(report.channel.latestVersion).toBe("2.0.0-alpha.0");
  });
});
