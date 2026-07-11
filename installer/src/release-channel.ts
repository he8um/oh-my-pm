// Release channel metadata design: deterministic local grouping of verified
// releases. Nothing here writes channel files, contacts remote endpoints,
// or moves artifacts anywhere.

import type {
  ReleaseChannelDryRunReport,
  ReleaseChannelEntry,
  ReleaseChannelMetadata,
  ReleaseChannelMetadataInput,
  ReleaseChannelName,
  ReleaseChannelValidationReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { validateReleaseMetadata } from "./release-metadata.js";
import { isNonEmptyString } from "./validate.js";

export const RELEASE_CHANNEL_SCHEMA_VERSION = "1";

const CHANNEL_NAMES: readonly ReleaseChannelName[] = ["stable", "beta", "nightly", "dev"];

/** Whether a string names a supported release channel. */
export function validateReleaseChannelName(value: string): value is ReleaseChannelName {
  return (CHANNEL_NAMES as readonly string[]).includes(value);
}

/**
 * Deterministic entry comparison: createdAt first, then version, both by
 * plain code-unit ordering — no clock, no locale, no semver parsing.
 */
export function compareReleaseChannelEntries(
  left: ReleaseChannelEntry,
  right: ReleaseChannelEntry,
): number {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  if (left.version < right.version) return -1;
  if (left.version > right.version) return 1;
  return 0;
}

/** Latest entry by comparison order; undefined when there are none. */
export function selectLatestReleaseChannelEntry(
  entries: readonly ReleaseChannelEntry[],
): ReleaseChannelEntry | undefined {
  let latest: ReleaseChannelEntry | undefined;
  for (const entry of entries) {
    if (latest === undefined || compareReleaseChannelEntries(entry, latest) > 0) {
      latest = entry;
    }
  }
  return latest;
}

function cloneEntry(entry: ReleaseChannelEntry): ReleaseChannelEntry {
  return JSON.parse(JSON.stringify(entry)) as ReleaseChannelEntry;
}

/** Build channel metadata with entries sorted newest first. */
export function createReleaseChannelMetadata(
  input: ReleaseChannelMetadataInput,
): ReleaseChannelMetadata {
  const entries = input.entries
    .map(cloneEntry)
    .sort((left, right) => compareReleaseChannelEntries(right, left));
  return {
    schemaVersion: RELEASE_CHANNEL_SCHEMA_VERSION,
    channel: input.channel,
    latestVersion: entries[0]?.version ?? "",
    entries,
  };
}

/** Validate channel metadata; reasons appear at most once, in fixed order. */
export function validateReleaseChannelMetadata(
  channel: ReleaseChannelMetadata,
): ReleaseChannelValidationReport {
  const reasons: string[] = [];
  if (!validateReleaseChannelName(channel.channel)) {
    reasons.push("release_channel_invalid");
  }
  if (!isNonEmptyString(channel.latestVersion)) {
    reasons.push("release_channel_latest_version_missing");
  }
  if (channel.entries.length === 0) {
    reasons.push("release_channel_entries_must_not_be_empty");
  }
  if (channel.entries.some((entry) => !isNonEmptyString(entry.version))) {
    reasons.push("release_channel_entry_version_missing");
  }
  if (channel.entries.some((entry) => !isNonEmptyString(entry.createdAt))) {
    reasons.push("release_channel_entry_created_at_missing");
  }
  if (channel.entries.some((entry) => !validateReleaseMetadata(entry.metadata).ok)) {
    reasons.push("release_channel_entry_metadata_invalid");
  }
  if (channel.entries.some((entry) => !entry.integrity.ok)) {
    reasons.push("release_channel_entry_integrity_failed");
  }
  const latest = selectLatestReleaseChannelEntry(channel.entries);
  if (latest !== undefined && latest.version !== channel.latestVersion) {
    reasons.push("release_channel_latest_version_mismatch");
  }
  const versions = channel.entries.map((entry) => entry.version);
  if (new Set(versions).size !== versions.length) {
    reasons.push("duplicate_release_channel_entry_version");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Build and validate channel metadata as a dry run; nothing is written. */
export function createReleaseChannelDryRun(
  input: ReleaseChannelMetadataInput,
): ReleaseChannelDryRunReport {
  const channel = createReleaseChannelMetadata(input);
  const validation = validateReleaseChannelMetadata(channel);
  if (validation.ok) {
    return { ok: true, channel, validation };
  }
  return {
    ok: false,
    channel,
    validation,
    warnings: validation.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
