// Loader and validator for release-state.json, the repository-local contract
// describing where the project sits in its release lifecycle.
//
// Why this exists
// ---------------
// version.json answers exactly one question: what version is the SOURCE. It
// cannot say whether that version has been published, what the latest published
// stable is, or which commit that stable points at. Documentation constantly
// makes those claims ("latest stable release is X", "prepared but not yet
// published"), and nothing could check them -- so they drifted silently, which
// is what Issue #30 recorded.
//
// The three contracts stay separate and non-overlapping:
//
//   version.json          the current SOURCE version
//   release-state.json    the release LIFECYCLE and the latest published stable
//   command-surface.json  the command and shim inventory
//
// This file is a fact about published releases, so it is deliberately offline:
// validation never calls the GitHub API. A validator that needs the network
// cannot run in a hermetic build, and a network failure would read as a
// documentation defect. The contract is updated by the maintainer as part of the
// publication change that makes it true, and the release workflow independently
// re-verifies the real tag and release at publish time.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";

export const RELEASE_STATE_PATH = "release-state.json";

/** The lifecycle states the source version may be in. */
export const SOURCE_STATES = Object.freeze(["prepared", "published"]);

const SEMVER = /^\d+\.\d+\.\d+$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const TAG = /^v\d+\.\d+\.\d+$/;
const RELEASE_LINE = /^v\d+\.\d+$/;

/**
 * Read and structurally validate release-state.json.
 *
 * Returns `{ state, errors }`. Callers decide how to report: the validator
 * prints and fails the build, the tests assert. `state` is null when the file
 * is missing or unparseable.
 */
export function loadReleaseState(repoRoot = REPO_ROOT) {
  const errors = [];
  let raw;
  try {
    raw = readFileSync(join(repoRoot, RELEASE_STATE_PATH), "utf8");
  } catch {
    return { state: null, errors: [`${RELEASE_STATE_PATH} is missing`] };
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (error) {
    return { state: null, errors: [`${RELEASE_STATE_PATH} is not valid JSON: ${error.message}`] };
  }

  const err = (msg) => errors.push(`${RELEASE_STATE_PATH}: ${msg}`);

  // --- Shape -------------------------------------------------------------
  const KNOWN_KEYS = [
    "schemaVersion",
    "sourceVersion",
    "sourceState",
    "latestStableVersion",
    "latestStableTag",
    "latestStableCommit",
    "releaseLine",
    "bundleProfile",
    "publicationTarget",
  ];
  for (const key of KNOWN_KEYS) {
    if (!Object.hasOwn(state, key)) err(`missing required key "${key}"`);
  }
  for (const key of Object.keys(state)) {
    if (!KNOWN_KEYS.includes(key)) err(`unknown key "${key}"`);
  }

  // --- Field formats -----------------------------------------------------
  if (state.schemaVersion !== 1) err("schemaVersion must be 1");
  if (typeof state.sourceVersion !== "string" || !SEMVER.test(state.sourceVersion)) {
    err(`sourceVersion must be a bare semver, got ${JSON.stringify(state.sourceVersion)}`);
  }
  if (!SOURCE_STATES.includes(state.sourceState)) {
    err(`sourceState must be one of ${SOURCE_STATES.join(" | ")}`);
  }
  if (typeof state.latestStableVersion !== "string" || !SEMVER.test(state.latestStableVersion)) {
    err("latestStableVersion must be a bare semver");
  }
  if (typeof state.latestStableTag !== "string" || !TAG.test(state.latestStableTag)) {
    err("latestStableTag must look like vX.Y.Z");
  }
  if (typeof state.latestStableCommit !== "string" || !FULL_SHA.test(state.latestStableCommit)) {
    // A short SHA is ambiguous and an uppercase one will not compare equal to
    // git's output; require the exact 40-character lowercase form.
    err("latestStableCommit must be a full 40-character lowercase commit SHA");
  }
  if (typeof state.releaseLine !== "string" || !RELEASE_LINE.test(state.releaseLine)) {
    err("releaseLine must look like vX.Y");
  }
  if (typeof state.bundleProfile !== "string" || state.bundleProfile.length === 0) {
    err("bundleProfile must be a non-empty string");
  }
  if (state.publicationTarget !== null) {
    if (typeof state.publicationTarget !== "string" || !TAG.test(state.publicationTarget)) {
      err("publicationTarget must be null or look like vX.Y.Z");
    }
  }

  // --- Relationships between fields --------------------------------------
  // These are the invariants that make the contract meaningful; each one
  // corresponds to a way documentation has actually drifted.
  if (typeof state.latestStableVersion === "string" && typeof state.latestStableTag === "string") {
    if (state.latestStableTag !== `v${state.latestStableVersion}`) {
      err(
        `latestStableTag ${state.latestStableTag} does not match ` +
          `latestStableVersion ${state.latestStableVersion}`,
      );
    }
  }

  if (typeof state.sourceVersion === "string" && typeof state.releaseLine === "string") {
    const [major, minor] = state.sourceVersion.split(".");
    if (state.releaseLine !== `v${major}.${minor}`) {
      err(`releaseLine ${state.releaseLine} does not contain sourceVersion ${state.sourceVersion}`);
    }
  }

  if (state.sourceState === "prepared") {
    // Prepared means: this source version is not yet published, so the latest
    // stable must be some OTHER, earlier version, and a target must be named.
    if (state.latestStableVersion === state.sourceVersion) {
      err(
        `sourceState is "prepared" but latestStableVersion equals sourceVersion ` +
          `(${state.sourceVersion}); a prepared version is by definition unpublished`,
      );
    }
    if (state.publicationTarget === null) {
      err('sourceState is "prepared" but publicationTarget is null');
    } else if (state.publicationTarget !== `v${state.sourceVersion}`) {
      err(
        `publicationTarget ${state.publicationTarget} must be the source version ` +
          `v${state.sourceVersion} while prepared`,
      );
    }
  }

  if (state.sourceState === "published") {
    // Published means: this source version IS the latest stable, and nothing is
    // pending publication.
    if (state.latestStableVersion !== state.sourceVersion) {
      err(
        `sourceState is "published" but latestStableVersion ` +
          `(${state.latestStableVersion}) is not sourceVersion (${state.sourceVersion})`,
      );
    }
    if (state.publicationTarget !== null) {
      err(
        `sourceState is "published" but publicationTarget is ` +
          `${JSON.stringify(state.publicationTarget)}; it must be null`,
      );
    }
  }

  return { state, errors };
}

/** True when the source version has been published as the latest stable. */
export const isPublished = (state) => state.sourceState === "published";
