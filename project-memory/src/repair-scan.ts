// The corruption scanner: a deterministic, strictly read-only classification of
// what is wrong with one project's store.
//
// Why this is not built on `inspect()`
// -----------------------------------
// `inspect()` answers "is this store healthy enough to use", and it deliberately
// reports a coarse issue kind plus a sanitized message. That is the right shape
// for a status command and the wrong shape for recovery: the same
// `integrityFailure` kind covers a checksum mismatch on an authoritative record
// (which may only be isolated) and a derived projection that disagrees with
// verified records (which may be rebuilt). Choosing between those requires the
// raw distinction, which `inspect()` has already discarded by the time it
// returns. So the scanner reads the store's structures itself.
//
// It shares the store's parsing and integrity primitives rather than
// reimplementing them, so a record the scanner calls verified is verified by
// exactly the code the read path uses.
//
// Guarantees:
//
//   * NO mutation. Every filesystem call this module makes is a read. There is no
//     write, no create, no remove, and no lock acquisition anywhere in it, which
//     is what makes a scan safe to run against a store another process is using.
//   * Deterministic ordering. Findings are sorted by a fixed key, so two scans of
//     unchanged bytes produce byte-identical JSON.
//   * Sanitized output. Every target is store-relative; no absolute path,
//     environment value, or raw record content is ever placed in a finding.

import { computeIntegrity, deriveProjectKey, deriveRecordKey } from "./integrity.js";
import type { FileSystem } from "./filesystem.js";
import { STALE_LOCK_THRESHOLD_MS } from "./lock.js";
import { parseAndVerifyEnvelope, parseAndVerifyManifest } from "./manifest.js";
import {
  EVIDENCE_DIRNAME,
  SNAPSHOTS_DIRNAME,
  STAGING_DIRNAME,
  lockPathFor,
  manifestPathFor,
  projectDirFor,
  recordStoreRelativePath,
} from "./path-safety.js";
import type { StoreLayout } from "./path-safety.js";
import { CURRENT_STORE_FORMAT_VERSION, SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION } from "./types.js";
import type { ProjectStoreManifest } from "./types.js";
import type {
  RepairFinding,
  RepairFindingCode,
  RepairScanResult,
  RepairSummary,
} from "./repair-types.js";
import { REPAIR_FINDING_CODES } from "./repair-types.js";

/** Domain separator for the store fingerprint. */
const DOMAIN_STORE_FINGERPRINT = "oh-my-pm:project-memory:v1:store-fingerprint";

/** Domain separator for a quarantine entry key. */
const DOMAIN_QUARANTINE_ENTRY = "oh-my-pm:project-memory:v1:quarantine-entry";

/** The temp-file prefix the store's own atomic writes use. */
const TEMP_PREFIX = ".tmp-";

/**
 * Derive the operation-scoped quarantine slot key for a store-relative path.
 *
 * Content-independent by design: the slot must be computable for a file whose
 * bytes cannot be parsed, and must stay stable across a retry so a second apply
 * reuses the same slot rather than duplicating evidence.
 */
export function deriveQuarantineEntryKey(relativePath: string): string {
  return computeIntegrity(DOMAIN_QUARANTINE_ENTRY, relativePath).slice("sha256:".length);
}

/** Scanner inputs. The clock is injected; the scanner never reads one itself. */
export interface RepairScanOptions {
  readonly fs: FileSystem;
  readonly layout: StoreLayout;
  readonly projectId: string;
}

/** A file the scanner read, with its store-relative path and raw bytes. */
interface ObservedFile {
  readonly relativePath: string;
  readonly raw: string;
}

/**
 * Scan one project's store and classify every detected problem.
 *
 * Ordering: findings are emitted grouped by the fixed `REPAIR_FINDING_CODES`
 * order and, within a code, sorted by target. Determinism matters beyond
 * tidiness — the plan is fingerprinted, and an unstable order would make two
 * scans of identical bytes produce different plans.
 */
export async function scanStore(options: RepairScanOptions): Promise<RepairScanResult> {
  const { fs, layout, projectId } = options;
  const projectKey = deriveProjectKey(projectId);
  const projectDir = projectDirFor(layout, projectKey);
  const findings: RepairFinding[] = [];

  const storeExists = await fs.exists(projectDir);
  if (!storeExists) {
    return {
      projectId,
      storeExists: false,
      storeFingerprint: fingerprintOf([]),
      findings: [],
      summary: summarize([]),
    };
  }

  // Everything the fingerprint covers is collected as it is read, so the
  // fingerprint is a function of exactly the bytes the scan classified.
  const observed: ObservedFile[] = [];

  // ---- The manifest --------------------------------------------------------
  const manifestPath = manifestPathFor(layout, projectKey);
  const manifestRelative = storeRelative(layout, manifestPath);
  const manifestRaw = await fs.readFileIfExists(manifestPath);
  let manifest: ProjectStoreManifest | null = null;

  if (manifestRaw === null) {
    // A project directory with no manifest. The records may still be intact, but
    // nothing authoritative says which of them are current, and a manifest
    // rebuilt from unverifiable inventory would invent chronology the store never
    // recorded. Report; never fabricate.
    findings.push({
      code: "broken_manifest",
      authority: "authoritative",
      target: manifestRelative,
      repairability: "unrepairable",
      action: "report_unrepairable",
      blockingReason: "no manifest exists; capture chronology cannot be invented",
    });
  } else {
    observed.push({ relativePath: manifestRelative, raw: manifestRaw });
    const parsed = classifyManifest(manifestRaw, projectId, projectKey, manifestRelative);
    findings.push(...parsed.findings);
    manifest = parsed.manifest;
  }

  // ---- Records -------------------------------------------------------------
  // Read every record file present on disk, whether or not the manifest
  // references it: an orphan is only detectable by looking at the filesystem, and
  // a manifest-driven walk alone would miss it.
  const snapshotFiles = await readRecordDir(fs, layout, projectDir, SNAPSHOTS_DIRNAME, observed);
  const evidenceFiles = await readRecordDir(fs, layout, projectDir, EVIDENCE_DIRNAME, observed);

  const verifiedSnapshotKeys = new Set<string>();
  const verifiedEvidenceKeys = new Set<string>();

  if (manifest !== null) {
    findings.push(
      ...classifyRecords({
        manifest,
        projectId,
        projectKey,
        recordType: "snapshot",
        dirname: SNAPSHOTS_DIRNAME,
        files: snapshotFiles,
        verified: verifiedSnapshotKeys,
      }),
    );
    findings.push(
      ...classifyRecords({
        manifest,
        projectId,
        projectKey,
        recordType: "evidence",
        dirname: EVIDENCE_DIRNAME,
        files: evidenceFiles,
        verified: verifiedEvidenceKeys,
      }),
    );
    findings.push(...classifyDerivedState(manifest, manifestRelative));
    findings.push(...classifyPartialMigration(manifest, manifestRelative));
  } else {
    // Without a verified manifest every record on disk is unreferenced. They are
    // reported as orphans but NOT re-indexed: re-indexing requires a manifest to
    // index into, and inventing one is exactly what must not happen.
    for (const file of [...snapshotFiles, ...evidenceFiles]) {
      findings.push({
        code: "orphaned_record",
        authority: "authoritative",
        target: file.relativePath,
        repairability: "blocked",
        action: "report_unrepairable",
        blockingReason: "no verified manifest exists to re-index into",
      });
    }
  }

  // ---- Residue and coordination state --------------------------------------
  findings.push(...(await classifyResidue(fs, layout, projectDir, observed)));
  findings.push(...(await classifyLock(fs, layout, projectKey)));

  const ordered = sortFindings(findings);
  return {
    projectId,
    storeExists: true,
    storeFingerprint: fingerprintOf(observed),
    findings: ordered,
    summary: summarize(ordered),
  };
}

// ---- Manifest classification ----------------------------------------------

/**
 * Classify the manifest's own readability.
 *
 * The order of these checks is a safety property. An unsupported FUTURE format is
 * detected before any integrity or structural judgement, because this build must
 * not reason about a schema it does not understand — and must never rewrite it.
 */
function classifyManifest(
  raw: string,
  projectId: string,
  projectKey: string,
  relativePath: string,
): { manifest: ProjectStoreManifest | null; findings: readonly RepairFinding[] } {
  // Does it parse at all?
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      manifest: null,
      findings: [
        {
          code: "malformed_json",
          authority: "authoritative",
          target: relativePath,
          repairability: "repairable",
          action: "quarantine_authoritative_file",
        },
      ],
    };
  }

  // A future store format is refused before anything else looks at it.
  const declaredVersion = (parsedJson as { storeFormatVersion?: unknown })?.storeFormatVersion;
  if (typeof declaredVersion === "number" && declaredVersion > CURRENT_STORE_FORMAT_VERSION) {
    return {
      manifest: null,
      findings: [
        {
          code: "unsupported_schema",
          authority: "authoritative",
          target: relativePath,
          repairability: "unrepairable",
          action: "report_unsupported_schema",
          blockingReason: "the store format is newer than this build supports",
        },
      ],
    };
  }
  const declaredSchema = (parsedJson as { projectBrainSchemaVersion?: unknown })
    ?.projectBrainSchemaVersion;
  if (
    typeof declaredSchema === "number" &&
    declaredSchema !== SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION
  ) {
    return {
      manifest: null,
      findings: [
        {
          code: "unsupported_schema",
          authority: "authoritative",
          target: relativePath,
          repairability: "unrepairable",
          action: "report_unsupported_schema",
          blockingReason: "the Project Brain schema version is not supported by this build",
        },
      ],
    };
  }

  // Integrity and structure, using the same verifier the read path uses.
  try {
    const manifest = parseAndVerifyManifest(raw);
    if (manifest.projectId !== projectId || manifest.projectKey !== projectKey) {
      return {
        manifest: null,
        findings: [
          {
            code: "broken_manifest",
            authority: "authoritative",
            target: relativePath,
            repairability: "repairable",
            action: "quarantine_authoritative_file",
          },
        ],
      };
    }
    return { manifest, findings: [] };
  } catch (err) {
    const code = errorCode(err);
    // An integrity mismatch is NEVER re-signed from the parsed content: that
    // would compute a digest over whatever the bytes now say and call the result
    // verified, which converts silent corruption into apparently-valid state.
    if (code === "OMP-MEM-1005") {
      return {
        manifest: null,
        findings: [
          {
            code: "checksum_mismatch",
            authority: "authoritative",
            target: relativePath,
            repairability: "repairable",
            action: "quarantine_authoritative_file",
            blockingReason: "a recorded digest is never recomputed from damaged content",
          },
        ],
      };
    }
    return {
      manifest: null,
      findings: [
        {
          code: "broken_manifest",
          authority: "authoritative",
          target: relativePath,
          repairability: "repairable",
          action: "quarantine_authoritative_file",
        },
      ],
    };
  }
}

// ---- Record classification -------------------------------------------------

interface ClassifyRecordsInput {
  readonly manifest: ProjectStoreManifest;
  readonly projectId: string;
  readonly projectKey: string;
  readonly recordType: "snapshot" | "evidence";
  readonly dirname: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME;
  readonly files: readonly ObservedFile[];
  /** Populated with the keys that verified, for the derived-state check. */
  readonly verified: Set<string>;
}

/** Classify every record file and every manifest reference for one record kind. */
function classifyRecords(input: ClassifyRecordsInput): readonly RepairFinding[] {
  const { manifest, projectId, recordType, files, verified } = input;
  const findings: RepairFinding[] = [];

  const referencedIds = recordType === "snapshot" ? manifest.snapshotIds : manifest.evidenceIds;

  // A duplicate id in the inventory is a manifest-level (derived) defect: the
  // record files themselves may be perfectly valid.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of referencedIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  for (const id of [...duplicates].sort()) {
    findings.push({
      code: "duplicate_record_id",
      authority: "derived",
      target: `${recordType}:${deriveRecordKey(recordType, id)}`,
      repairability: "repairable",
      action: "rebuild_derived_manifest",
    });
  }

  const byKey = new Map(files.map((file) => [basenameKey(file.relativePath), file]));
  const referencedKeys = new Map<string, string>();
  for (const id of seen) referencedKeys.set(deriveRecordKey(recordType, id), id);

  // Referenced records: present, parseable, and verified?
  for (const [key, recordId] of [...referencedKeys].sort(byFirst)) {
    const file = byKey.get(key);
    if (file === undefined) {
      findings.push({
        code: "missing_referenced_record",
        authority: "authoritative",
        // The SAME store-relative form every other target uses. A shorter
        // spelling here would not match the path the manifest rebuild derives, so
        // the missing record would never be dropped from the inventory and the
        // store would never converge.
        target: recordStoreRelativePath(input.projectKey, input.dirname, key),
        repairability: "repairable",
        // The manifest is derived state referencing bytes that no longer exist.
        // Rebuilding the inventory from what IS verified is the safe response;
        // inventing a replacement record is not.
        action: "rebuild_derived_manifest",
      });
      continue;
    }
    const verdict = verifyRecord(file.raw, recordType, projectId, recordId);
    if (verdict.ok) {
      verified.add(key);
      continue;
    }
    findings.push({
      code: verdict.code,
      authority: "authoritative",
      target: file.relativePath,
      repairability: "repairable",
      action: "quarantine_authoritative_file",
      ...(verdict.blockingReason !== undefined ? { blockingReason: verdict.blockingReason } : {}),
    });
  }

  // Unreferenced files on disk.
  for (const key of [...byKey.keys()].sort()) {
    if (referencedKeys.has(key)) continue;
    const file = byKey.get(key) as ObservedFile;
    // An orphan may only be re-indexed after it verifies. An unverifiable orphan
    // is isolated instead — adding it to the manifest would put damaged bytes
    // back into authoritative state.
    const parsedOk = parsesAsEnvelopeFor(file.raw, recordType, projectId);
    findings.push(
      parsedOk
        ? {
            code: "orphaned_record",
            authority: "authoritative",
            target: file.relativePath,
            repairability: "repairable",
            action: "reindex_verified_orphan",
          }
        : {
            code: "orphaned_record",
            authority: "authoritative",
            target: file.relativePath,
            repairability: "repairable",
            action: "quarantine_authoritative_file",
            blockingReason: "an unverifiable orphan is isolated, never re-indexed",
          },
    );
  }

  return findings;
}

/** Verify one record envelope with the same code the read path uses. */
function verifyRecord(
  raw: string,
  recordType: "snapshot" | "evidence",
  projectId: string,
  recordId: string,
): { ok: true } | { ok: false; code: RepairFindingCode; blockingReason?: string } {
  try {
    JSON.parse(raw);
  } catch {
    return { ok: false, code: "malformed_json" };
  }
  try {
    parseAndVerifyEnvelope(raw, { recordType, projectId, recordId });
    return { ok: true };
  } catch (err) {
    const code = errorCode(err);
    if (code === "OMP-MEM-1005") {
      return {
        ok: false,
        code: "checksum_mismatch",
        blockingReason: "a recorded digest is never recomputed from damaged content",
      };
    }
    return { ok: false, code: "missing_required_field" };
  }
}

/** True when raw parses as an envelope carrying its own consistent identity. */
function parsesAsEnvelopeFor(
  raw: string,
  recordType: "snapshot" | "evidence",
  projectId: string,
): boolean {
  let recordId: unknown;
  try {
    recordId = (JSON.parse(raw) as { recordId?: unknown }).recordId;
  } catch {
    return false;
  }
  if (typeof recordId !== "string" || recordId.length === 0) return false;
  try {
    parseAndVerifyEnvelope(raw, { recordType, projectId, recordId });
    return true;
  } catch {
    return false;
  }
}

// ---- Derived-state and migration classification ---------------------------

/**
 * Classify disagreement inside the manifest's own derived projection.
 *
 * These are checks the manifest's structural verifier does not already enforce.
 * `parseAndVerifyManifest` rejects a chronology that violates its invariants, so
 * a manifest reaching here has a self-consistent history; what remains is
 * agreement between the chronology and the inventory.
 */
function classifyDerivedState(
  manifest: ProjectStoreManifest,
  manifestRelative: string,
): readonly RepairFinding[] {
  const findings: RepairFinding[] = [];
  const history = manifest.snapshotHistory;
  if (history === undefined) return findings;

  const inventory = new Set(manifest.snapshotIds);
  const chronology = new Set(history.map((entry) => entry.snapshotId));

  const missingFromInventory = [...chronology].filter((id) => !inventory.has(id)).sort();
  const missingFromChronology = [...inventory].filter((id) => !chronology.has(id)).sort();

  if (missingFromInventory.length > 0 || missingFromChronology.length > 0) {
    findings.push({
      code: "broken_derived_index",
      authority: "derived",
      target: manifestRelative,
      repairability: "repairable",
      action: "rebuild_derived_index",
    });
  }
  return findings;
}

/**
 * Classify evidence of a migration that advanced a version without completing.
 *
 * Evidence comes from the migration framework's own recorded history, not from a
 * guess: a history entry whose `toStoreFormatVersion` exceeds the manifest's
 * actual `storeFormatVersion` means a step was recorded as done while the store
 * stayed behind.
 */
function classifyPartialMigration(
  manifest: ProjectStoreManifest,
  manifestRelative: string,
): readonly RepairFinding[] {
  const history = manifest.migrationHistory ?? [];
  if (history.length === 0) return [];
  const highestRecorded = history.reduce(
    (max, entry) => Math.max(max, entry.toStoreFormatVersion),
    0,
  );
  if (highestRecorded <= manifest.storeFormatVersion) return [];
  return [
    {
      code: "partial_migration",
      authority: "authoritative",
      target: manifestRelative,
      repairability: "blocked",
      action: "report_unrepairable",
      blockingReason:
        "migration history records a version this store never reached; the pre-migration backup is authoritative",
    },
  ];
}

// ---- Residue and lock classification --------------------------------------

/**
 * Classify removable residue: this store's own temp files and abandoned staging.
 *
 * Ownership is proven by NAME, not assumed from location. Only files carrying the
 * store's own `.tmp-` prefix are claimed, and only inside directories the store
 * owns. A file a concurrent writer created is a temp file too, but removing one
 * mid-write would destroy an in-flight commit — so residue removal is scoped to
 * abandoned staging plus prefixed temps, and the writer lock held during apply is
 * what makes "abandoned" true rather than "currently in use".
 */
async function classifyResidue(
  fs: FileSystem,
  layout: StoreLayout,
  projectDir: string,
  observed: ObservedFile[],
): Promise<readonly RepairFinding[]> {
  const findings: RepairFinding[] = [];

  for (const dirname of [SNAPSHOTS_DIRNAME, EVIDENCE_DIRNAME, STAGING_DIRNAME]) {
    const dir = `${projectDir}/${dirname}`;
    if (!(await fs.exists(dir))) continue;
    const entries = await fs.readDir(dir);
    for (const entry of [...entries].sort((a, b) => compare(a.name, b.name))) {
      if (entry.isSymbolicLink || !entry.isFile) continue;
      const isTemp = entry.name.startsWith(TEMP_PREFIX);
      const isStaged = dirname === STAGING_DIRNAME;
      if (!isTemp && !isStaged) continue;
      const relativePath = `${storeRelative(layout, dir)}/${entry.name}`;
      // Residue contributes to the fingerprint by NAME only. Its contents are
      // not authoritative, and reading a partially-written temp file adds nothing
      // a repair decision depends on.
      observed.push({ relativePath, raw: "" });
      findings.push({
        code: "temporary_file_residue",
        authority: "residue",
        target: relativePath,
        repairability: "repairable",
        action: "remove_owned_temporary_residue",
      });
    }
  }
  return findings;
}

/**
 * Classify the project lock.
 *
 * Uses the existing rule verbatim — age above the threshold AND a dead owner.
 * Reclaiming on age alone would evict a live writer that is merely slow, which is
 * exactly the failure the rule exists to prevent, so a live or young lock is
 * reported as blocked rather than actionable.
 */
async function classifyLock(
  fs: FileSystem,
  layout: StoreLayout,
  projectKey: string,
): Promise<readonly RepairFinding[]> {
  const lockPath = lockPathFor(layout, projectKey);
  const raw = await fs.readLock(lockPath);
  if (raw === null) return [];
  const relativePath = storeRelative(layout, lockPath);

  let record: { pid?: unknown; createdAt?: unknown };
  try {
    record = JSON.parse(raw) as { pid?: unknown; createdAt?: unknown };
  } catch {
    // An unreadable lock is not reclaimed automatically: its owner cannot be
    // identified, so liveness cannot be established.
    return [
      {
        code: "stale_lock",
        authority: "coordination",
        target: relativePath,
        repairability: "blocked",
        action: "report_unrepairable",
        blockingReason: "the lock is unreadable, so its owner cannot be proven dead",
      },
    ];
  }

  const pid = typeof record.pid === "number" ? record.pid : null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : null;
  if (pid === null || createdAt === null) {
    return [
      {
        code: "stale_lock",
        authority: "coordination",
        target: relativePath,
        repairability: "blocked",
        action: "report_unrepairable",
        blockingReason: "the lock record is incomplete, so its owner cannot be proven dead",
      },
    ];
  }

  const age = ageMs(fs.referenceNow(), createdAt);
  const old = age > STALE_LOCK_THRESHOLD_MS;
  const dead = !fs.isProcessAlive(pid);
  if (old && dead) {
    return [
      {
        code: "stale_lock",
        authority: "coordination",
        target: relativePath,
        repairability: "repairable",
        action: "reclaim_dead_stale_lock",
      },
    ];
  }
  return [
    {
      code: "stale_lock",
      authority: "coordination",
      target: relativePath,
      repairability: "blocked",
      action: "report_unrepairable",
      blockingReason: dead
        ? "the lock owner is dead but the lock is not yet older than the stale threshold"
        : "the lock owner is still alive",
    },
  ];
}

/** Milliseconds between two RFC3339 timestamps, or +Infinity if unparseable. */
function ageMs(nowIso: string, createdAtIso: string): number {
  const now = Date.parse(nowIso);
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(now) || Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return now - created;
}

// ---- Reading helpers -------------------------------------------------------

/** Read one record directory's `.json` files, skipping symlinks and temps. */
async function readRecordDir(
  fs: FileSystem,
  layout: StoreLayout,
  projectDir: string,
  dirname: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
  observed: ObservedFile[],
): Promise<readonly ObservedFile[]> {
  const dir = `${projectDir}/${dirname}`;
  if (!(await fs.exists(dir))) return [];
  const entries = await fs.readDir(dir);
  const files: ObservedFile[] = [];
  for (const entry of [...entries].sort((a, b) => compare(a.name, b.name))) {
    // A symlink inside a record directory is never followed; it is residue-like
    // and handled by the residue pass, not read as a record.
    if (entry.isSymbolicLink || !entry.isFile) continue;
    if (!entry.name.endsWith(".json")) continue;
    if (entry.name.startsWith(TEMP_PREFIX)) continue;
    const raw = await fs.readFileIfExists(`${dir}/${entry.name}`);
    if (raw === null) continue;
    const file = { relativePath: `${storeRelative(layout, dir)}/${entry.name}`, raw };
    files.push(file);
    observed.push(file);
  }
  return files;
}

/**
 * The store-relative form of an absolute managed path.
 *
 * Every finding target passes through here, which is what keeps an absolute local
 * path out of the output. POSIX separators are forced so a plan generated on
 * Windows compares equal to one generated elsewhere.
 */
function storeRelative(layout: StoreLayout, absolutePath: string): string {
  const root = layout.storeRoot;
  const relative = absolutePath.startsWith(root) ? absolutePath.slice(root.length) : absolutePath;
  return relative.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

/** The record key from a `<dir>/<key>.json` relative path. */
function basenameKey(relativePath: string): string {
  const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return base.endsWith(".json") ? base.slice(0, -".json".length) : base;
}

// ---- Determinism helpers ---------------------------------------------------

/** Stable string comparison, independent of host locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byFirst(a: readonly [string, string], b: readonly [string, string]): number {
  return compare(a[0], b[0]);
}

/**
 * Sort findings into the fixed emission order: by finding-code rank, then target,
 * then action. Two scans of identical bytes therefore serialize identically.
 */
function sortFindings(findings: readonly RepairFinding[]): readonly RepairFinding[] {
  const rank = new Map(REPAIR_FINDING_CODES.map((code, index) => [code, index]));
  return [...findings].sort((a, b) => {
    const byCode = (rank.get(a.code) ?? 0) - (rank.get(b.code) ?? 0);
    if (byCode !== 0) return byCode;
    const byTarget = compare(a.target, b.target);
    if (byTarget !== 0) return byTarget;
    return compare(a.action, b.action);
  });
}

/**
 * A content-derived digest over the observed store state.
 *
 * Content, never modification time: mtime granularity is coarse and
 * platform-dependent, can be moved backwards, and does not change at all for a
 * same-size in-place edit — so a plan keyed on mtime could be applied against a
 * store whose bytes had since changed, which is precisely the race the
 * fingerprint exists to prevent.
 */
function fingerprintOf(observed: readonly ObservedFile[]): string {
  const sorted = [...observed].sort((a, b) => compare(a.relativePath, b.relativePath));
  return computeIntegrity(
    DOMAIN_STORE_FINGERPRINT,
    sorted.map((file) => ({
      path: file.relativePath,
      content: computeIntegrity(DOMAIN_STORE_FINGERPRINT, file.raw),
    })),
  );
}

/** Count findings by repairability. */
function summarize(findings: readonly RepairFinding[]): RepairSummary {
  let repairable = 0;
  let blocked = 0;
  let unrepairable = 0;
  for (const finding of findings) {
    if (finding.repairability === "repairable") repairable += 1;
    else if (finding.repairability === "blocked") blocked += 1;
    else unrepairable += 1;
  }
  return {
    findingCount: findings.length,
    repairableCount: repairable,
    blockedCount: blocked,
    unrepairableCount: unrepairable,
  };
}

/** A stable error code from an unknown thrown value. */
function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "";
}
