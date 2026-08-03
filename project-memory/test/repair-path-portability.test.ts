// Cross-platform path portability for the repair scanner.
//
// Why this file exists
// -------------------
// The first Windows run of the integrity matrix failed 56 tests. The cause was a
// single class of defect: NATIVE filesystem paths built by string concatenation.
//
//   `${projectDir}/${dirname}`  ->  C:\...\v1\projects\KEY/snapshots
//
// Windows accepts a mixed-separator path for a plain read, which is why the older
// store suites kept passing. But the scanner does not merely read: it DERIVES a
// path, enumerates it, converts the result to a canonical form, and compares that
// against paths the store itself wrote with `node:path`. A mixed-separator
// directory yields entries whose derived identity matches nothing, so the scan
// observed NOTHING -- and an empty observation set silently satisfies almost every
// downstream check. Findings vanished, the fingerprint became the digest of an
// empty set, and the stale-plan guard could never fire.
//
// The evidence problem this file solves
// ------------------------------------
// A POSIX host cannot detect that defect at all: there the separator IS "/", so
// concatenation and `join` are byte-identical by construction. A test that merely
// exercises the scanner on macOS therefore proves nothing about it, and a test
// that asserts a literal backslash fails on POSIX for the wrong reason.
//
// So this file tests the TRANSFORMATION RULES against `path.win32` and
// `path.posix` explicitly. That is checkable on every platform, and it fails if a
// native join is ever replaced by concatenation again.
//
// These tests are supplementary, and the limit is worth stating exactly rather
// than implying more than they deliver.
//
// MEASURED on a macOS host: reintroducing the concatenation defect at all three
// scanner sites leaves this whole suite passing, and so does reintroducing it in
// `absoluteFromStoreRelative`. That is not a weakness in the assertions -- it is
// arithmetic. When the platform separator IS "/", `join(a, b)` and `${a}/${b}`
// produce identical bytes, so no POSIX assertion can distinguish them.
//
// What these tests therefore DO provide: the win32/posix cases pin the
// transformation RULE, so a future reader can see which construction is correct
// and why, and the "non-empty observation" gate below stops the scanner suite from
// passing vacuously on an empty result set -- which is how 56 Windows failures hid
// behind assertions that looked satisfied.
//
// What they do NOT provide: proof that the scanner works on Windows. The Windows
// runner is the authority for that, and for junction, process-termination, and
// case-folding behaviour. Do not mark a separator fix proven on a green POSIX run.

import { join, posix, resolve, sep, win32 } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import {
  EVIDENCE_DIRNAME,
  PROJECTS_DIRNAME,
  SNAPSHOTS_DIRNAME,
  isSameOrInside,
  manifestPathFor,
  projectDirFor,
  recordPathFor,
  recordStoreRelativePath,
  resolveStoreLayout,
} from "../src/path-safety.js";
import { isPhysicallyInside } from "../src/physical-confinement.js";
import { absoluteFromStoreRelative } from "../src/repair-apply.js";
import { buildRepairPlan } from "../src/repair-plan.js";
import { scanStore } from "../src/repair-scan.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, makeStore, PROJECT_ROOT } from "./fixtures.js";

const PROJECT_ID = "portability-proj";
const NOW = "2026-04-01T00:00:00.000Z";
const layout = resolveStoreLayout(DATA_ROOT);
const projectKey = deriveProjectKey(PROJECT_ID);

/**
 * Reproduce, per platform flavour, the two ways a scanner could build the record
 * directory it enumerates.
 *
 * `impl` is `path.win32` or `path.posix`, so both branches are exercised from any
 * host. This is the mechanism the Windows failure came down to.
 */
function nativeDirCandidates(impl: typeof win32): {
  joined: string;
  concatenated: string;
  storeWrote: string;
} {
  const storeRoot = impl.join(impl.normalize(DATA_ROOT), "project-brain", "v1");
  const projectDir = impl.join(storeRoot, PROJECTS_DIRNAME, projectKey);
  return {
    // What the scanner must do.
    joined: impl.join(projectDir, SNAPSHOTS_DIRNAME),
    // What it used to do -- the defect.
    concatenated: `${projectDir}/${SNAPSHOTS_DIRNAME}`,
    // What the store itself wrote, via the same `node:path` join.
    storeWrote: impl.join(projectDir, SNAPSHOTS_DIRNAME, "record.json"),
  };
}

describe("the canonical/native path boundary", () => {
  it("derives a native directory that is separator-consistent, not mixed", () => {
    // The mechanism, stated precisely. `join` produces one separator throughout;
    // concatenation leaves a FOREIGN separator embedded mid-path:
    //
    //   join:         \\...\\projects\\KEY\\snapshots
    //   concatenated: \\...\\projects\\KEY/snapshots     <- mixed
    //
    // The mixed string is what the scanner used to hand to readDir/exists and to
    // storeRelative. `join` would later normalize it, which is exactly why an
    // assertion phrased on the JOINED result cannot see the defect -- the damage
    // happens while the raw string is still being used.
    const w = nativeDirCandidates(win32);
    expect(w.joined).not.toBe(w.concatenated);
    // The correct form contains no foreign separator at all.
    expect(w.joined).not.toContain("/");
    // The defective form does, and that is the whole failure.
    expect(w.concatenated).toContain("/");
    expect(w.concatenated).toContain("\\");
    // Joined addresses the file the store wrote; the store used the same join.
    expect(win32.join(w.joined, "record.json")).toBe(w.storeWrote);

    // On posix the two coincide, which is exactly why a macOS or Linux run cannot
    // detect the defect and why the win32 rule is pinned explicitly above.
    const p = nativeDirCandidates(posix);
    expect(p.joined).toBe(p.concatenated);
    expect(p.joined).not.toContain("\\");
  });

  it("keeps canonical store-relative identifiers on '/' for every platform", () => {
    // The persisted and printed format is "/"-separated so a plan generated on
    // Windows compares byte-equal to one generated on Linux. This must NOT become
    // platform-dependent -- it is a format contract, not a filesystem path.
    const canonical = recordStoreRelativePath(
      projectKey,
      SNAPSHOTS_DIRNAME,
      deriveRecordKey("snapshot", "snap-1"),
    );
    expect(canonical).not.toContain("\\");
    expect(canonical.startsWith(`${PROJECTS_DIRNAME}/`)).toBe(true);
    expect(canonical.split("/")).toHaveLength(4);
  });

  it("round-trips canonical -> native through path.join, not concatenation", () => {
    const canonical = recordStoreRelativePath(
      projectKey,
      EVIDENCE_DIRNAME,
      deriveRecordKey("evidence", "ev-1"),
    );
    // Equality with a segment-wise join excludes concatenation wherever the
    // platform separator is not "/".
    expect(absoluteFromStoreRelative(layout, canonical)).toBe(
      join(layout.storeRoot, ...canonical.split("/")),
    );
    // The result is native: no stray forward slash survives below the root on a
    // platform whose separator is not "/".
    expect(
      absoluteFromStoreRelative(layout, canonical).slice(layout.storeRoot.length),
    ).not.toContain(sep === "/" ? "\\" : "/");
  });
});

describe("the scanner observes a non-empty fixture", () => {
  /**
   * The anti-vacuity gate.
   *
   * Every Windows failure reduced to "the scan observed nothing", and an empty
   * observation set quietly satisfies count comparisons, `toEqual([])` checks, and
   * fingerprint stability alike. So these tests assert the scan actually SAW the
   * fixture's known records, by identity, before any other conclusion is drawn.
   */
  it("reports the exact record identities present in the store", async () => {
    const { store, fs } = makeStore({ now: () => NOW, pid: 7 });
    await store.commitSnapshotBundle({
      projectId: PROJECT_ID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "seed-1",
      occurredAt: NOW,
      snapshot: makeSnapshot(PROJECT_ID, "snap-1", ["ev-1"]),
      evidence: [makeEvidence(PROJECT_ID, "ev-1")],
    });

    // Damage BOTH records so the scan must report two findings, one per record.
    const snapCanonical = recordStoreRelativePath(
      projectKey,
      SNAPSHOTS_DIRNAME,
      deriveRecordKey("snapshot", "snap-1"),
    );
    const evCanonical = recordStoreRelativePath(
      projectKey,
      EVIDENCE_DIRNAME,
      deriveRecordKey("evidence", "ev-1"),
    );
    for (const canonical of [snapCanonical, evCanonical]) {
      // poke() normalizes, so this works whatever separator the layout used.
      fs.poke(absoluteFromStoreRelative(layout, canonical), "{ truncated");
    }

    const scan = await scanStore({ fs, layout, projectId: PROJECT_ID });

    // Non-empty FIRST, by identity, not by count: a zero-length findings array
    // would otherwise pass a "matches expected count" assertion that also expected
    // zero.
    const targets = scan.findings.map((f) => f.target);
    expect(targets).toContain(snapCanonical);
    expect(targets).toContain(evCanonical);
    expect(scan.findings.length).toBeGreaterThanOrEqual(2);

    // Targets are canonical: relative and "/"-separated on every platform.
    for (const target of targets) {
      expect(target).not.toContain("\\");
      expect(target.startsWith("/")).toBe(false);
      expect(target.includes(layout.storeRoot)).toBe(false);
    }
  });

  it("changes the fingerprint when governed bytes change, and only then", async () => {
    const { store, fs } = makeStore({ now: () => NOW, pid: 7 });
    await store.commitSnapshotBundle({
      projectId: PROJECT_ID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "seed-1",
      occurredAt: NOW,
      snapshot: makeSnapshot(PROJECT_ID, "snap-1", ["ev-1"]),
      evidence: [makeEvidence(PROJECT_ID, "ev-1")],
    });

    const first = await scanStore({ fs, layout, projectId: PROJECT_ID });
    // The fixture is genuinely non-empty: a healthy store yields no findings, so
    // the fingerprint is the only evidence the scan saw anything. Prove it differs
    // from the fingerprint of a store with nothing in it.
    const { fs: emptyFs } = makeStore({ now: () => NOW, pid: 7 });
    const emptyScan = await scanStore({ fs: emptyFs, layout, projectId: PROJECT_ID });
    expect(emptyScan.storeExists).toBe(false);
    expect(first.storeFingerprint).not.toBe(emptyScan.storeFingerprint);

    // Unchanged bytes -> identical fingerprint.
    const second = await scanStore({ fs, layout, projectId: PROJECT_ID });
    expect(second.storeFingerprint).toBe(first.storeFingerprint);

    // Changed governed bytes -> different fingerprint. Without this, an
    // always-empty observation set would make every store look identical and the
    // stale-plan guard could never fire.
    const canonical = recordStoreRelativePath(
      projectKey,
      EVIDENCE_DIRNAME,
      deriveRecordKey("evidence", "ev-1"),
    );
    fs.poke(absoluteFromStoreRelative(layout, canonical), "{ tampered");
    const third = await scanStore({ fs, layout, projectId: PROJECT_ID });
    expect(third.storeFingerprint).not.toBe(first.storeFingerprint);

    // And the plan built from it carries an executable action, so the guard has
    // something real to protect.
    const plan = buildRepairPlan({ scan: third, operationId: "op-1", generatedAt: NOW });
    expect(plan.actions.length).toBeGreaterThan(0);
  });
});

describe("containment honours the caller's case rule on every platform", () => {
  // `path.win32.relative` FOLDS CASE, so the previous `relative()`-based
  // implementation answered an explicit `caseInsensitive: false` request as if it
  // were `true` on Windows -- accepting a case variant as contained when the caller
  // had asked for exact matching. Segment comparison honours the flag everywhere.
  //
  // These cases are platform-independent: they exercise the comparison rule, not
  // the host filesystem, so they hold on Linux, macOS, and Windows alike.
  const cases: readonly [string, string, boolean, boolean, string][] = [
    ["/data/store", "/data/store/a.json", false, true, "normal containment"],
    ["/data/store", "/data/store-evil/a", false, false, "prefix sibling is refused"],
    ["/data/store", "/data/store", false, true, "identical path is contained"],
    ["/data/store", "/data", false, false, "a parent is not inside its child"],
    ["/data/store", "/other/x", false, false, "disjoint paths"],
    ["/data/Store", "/data/store/a", true, true, "case-insensitive folds the variant"],
    ["/data/Store", "/data/store/a", false, false, "case-sensitive refuses the variant"],
    ["/data/store", "/data/store/../evil", false, false, "traversal escape is refused"],
    ["/data/store", "/data/store/sub/deep/x", false, true, "deep containment"],
  ];

  for (const [outer, inner, caseInsensitive, expected, label] of cases) {
    it(`${label} (caseInsensitive=${caseInsensitive})`, () => {
      expect(isPhysicallyInside(outer, inner, caseInsensitive)).toBe(expected);
    });
  }

  it("cannot be implemented with relative(), because win32 folds case", () => {
    // This is the portable proof that the OLD implementation was wrong, and the
    // reason the fix cannot be validated by the cases above on a POSIX host:
    // `posix.relative` is case-SENSITIVE, so the old code behaved correctly there
    // and only diverged on Windows.
    //
    // win32.relative("\\data\\Store", "\\data\\store\\a") returns "a" -- a
    // containment verdict -- even though the caller asked for exact case matching.
    expect(win32.relative("\\data\\Store", "\\data\\store\\a")).toBe("a");
    // posix.relative refuses, which is why the defect was invisible off Windows.
    expect(posix.relative("/data/Store", "/data/store/a")).toBe("../store/a");

    // So a relative()-based check would answer `true` on Windows for a
    // case-sensitive request. The segment-comparing implementation answers `false`,
    // as the caller asked.
    expect(isPhysicallyInside("/data/Store", "/data/store/a", false)).toBe(false);
  });
});

describe("the layout root and every confined path agree on one spelling", () => {
  // The defect this pins was the deepest of the Windows failures, and unlike the
  // separator ones it IS provable on any platform, because it is about internal
  // agreement rather than a platform-specific separator.
  //
  // `resolveStoreLayout` used `normalize(dataRoot)`, while every managed path goes
  // through `confine`, which calls `resolve`. On Windows `resolve` prefixes the
  // CURRENT DRIVE onto a drive-relative path, so `layout.storeRoot` had no `D:`
  // segment while `projectDirFor(...)` did. `storeRelative` strips the root by
  // prefix, that strip failed, and the repair scanner's derived directories matched
  // nothing -- the scan reported an EMPTY store on a store full of records.
  it("makes every managed path start with the layout store root", () => {
    const key = deriveProjectKey(PROJECT_ID);
    const managed = [
      projectDirFor(layout, key),
      manifestPathFor(layout, key),
      recordPathFor(layout, key, SNAPSHOTS_DIRNAME, deriveRecordKey("snapshot", "s")),
      recordPathFor(layout, key, EVIDENCE_DIRNAME, deriveRecordKey("evidence", "e")),
    ];
    for (const path of managed) {
      // Prefix agreement is exactly what storeRelative() depends on, so it is the
      // property worth asserting rather than a spelling detail.
      expect(path.startsWith(layout.storeRoot)).toBe(true);
      expect(isSameOrInside(layout.storeRoot, path)).toBe(true);
    }
  });

  // NOT asserted here, deliberately: that `resolve` attaches a drive letter while
  // `normalize` does not. `win32.resolve` derives the drive from the process CWD,
  // and on a POSIX host there is no drive-letter CWD to derive -- so the divergence
  // simply does not reproduce off Windows, and a test claiming to show it would be
  // asserting something the host cannot exhibit. The Windows runner is the evidence
  // for that half; the two invariants below are what IS checkable everywhere.

  it("keeps the layout root stable under a second resolve", () => {
    // If the root were not already resolved, resolving it again would change it --
    // which is precisely how it came to disagree with the confined paths below it.
    expect(resolve(layout.storeRoot)).toBe(layout.storeRoot);
    expect(resolve(layout.dataRoot)).toBe(layout.dataRoot);
    expect(resolve(layout.projectsDir)).toBe(layout.projectsDir);
    expect(resolve(layout.locksDir)).toBe(layout.locksDir);
  });
});
