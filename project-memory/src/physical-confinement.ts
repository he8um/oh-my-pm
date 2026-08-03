// Filesystem-AWARE path confinement for the Node write boundary.
//
// This module is deliberately separate from path-safety.ts. That module is pure
// path arithmetic -- `resolve`/`normalize`/`relative` with a traversal check --
// and performs no I/O, which keeps the layout policy deterministically testable.
// But lexical arithmetic cannot see the filesystem: `<root>/projects/<key>` is
// lexically inside the root even when `projects` is a symlink, a Windows
// junction, or another reparse point pointing somewhere else entirely. A write
// through such a path lands outside the governed store while every lexical check
// passes.
//
// This module closes that gap by resolving PHYSICAL paths before a write. It
// walks the target one segment at a time from the canonical root downwards,
// following at most ONE link level per step and re-checking containment after
// every step, and rejects anything whose physical location leaves the canonical
// root. A target that does not exist yet is validated through its nearest
// existing parent, because a nonexistent leaf under an escaped parent is exactly
// as dangerous as an escaped leaf.
//
// Resolving one hop at a time -- rather than calling `realpath` once -- is load
// bearing. `realpath` collapses an entire chain, so a route that leaves the root
// and returns to it, `<root>/hop -> <outside>/back -> <root>/real`, resolves to a
// path inside the root and would be accepted, even though the write physically
// travels through a directory the store does not govern.
//
// Containment is decided with path arithmetic on ALREADY-CANONICALIZED paths --
// never a raw string-prefix test, which would accept `/data/store-evil` as
// inside `/data/store`. On case-insensitive filesystems (default on macOS and
// Windows) the comparison folds case, because there `STORE` and `store` are the
// same directory and a case variant must not be treated as an escape.
//
// Residual limitation, stated honestly: these checks reduce but do not eliminate
// TOCTOU exposure. A sufficiently privileged concurrent actor can replace an
// ancestor with a link in the window between validation and the write syscall.
// Eliminating that window entirely requires descriptor-relative operations
// (openat/O_NOFOLLOW per segment, or a Windows equivalent), which Node does not
// expose. The single-writer lock plus owner-only 0700 directory modes bound who
// can realistically win that race; the guarantee this module makes is
// "validated immediately before the write against the real filesystem", not
// "atomically race-free".

import { basename, dirname, isAbsolute, normalize, parse, resolve, sep } from "node:path";

import { invalidInput, pathEscape } from "./errors.js";

/**
 * Default case-sensitivity for containment comparisons.
 *
 * This module is pure -- it may not read `node:os`, because the platform boundary
 * lives in node-adapter.ts -- so it cannot detect the host filesystem itself. It
 * defaults to case-SENSITIVE, the stricter choice: a case variant is treated as a
 * different path and refused rather than quietly accepted. The Node adapter, which
 * is the module allowed to read the platform, passes the real answer
 * (`caseInsensitive: true` on macOS and Windows, where `STORE` and `store` are the
 * same directory).
 */
const CASE_INSENSITIVE_DEFAULT = false;

/** The narrow filesystem surface physical confinement needs. */
export interface PhysicalProbe {
  /** Resolve a path to its physical location, following every link. */
  realpath(path: string): Promise<string>;
  /**
   * Read ONE link level: the raw target of the link at `path`, or null when the
   * path is not a link. Distinct from `realpath`, which collapses an entire
   * chain -- and therefore cannot reveal that a chain passed OUTSIDE the root on
   * its way back in. Step-by-step resolution is what makes that visible.
   */
  readOneLink(path: string): Promise<string | null>;
}

/** Options controlling how a physical check is performed. */
export interface PhysicalConfinementOptions {
  /**
   * Override case sensitivity. Defaults to the platform rule. Tests pin both
   * behaviours explicitly rather than depending on the host filesystem.
   */
  readonly caseInsensitive?: boolean;
  /**
   * The filesystem probe. REQUIRED in practice: this module performs no I/O
   * itself, so the caller (the Node adapter, or a test) must supply one.
   */
  readonly probe?: PhysicalProbe;
  /**
   * Spellings of the store root that are known to denote the same directory as
   * the canonical root -- typically the configured root before the platform's own
   * links were resolved (macOS `/var` vs `/private/var`). A link target recorded
   * using one of these is recognized WITHOUT resolving the link, so an excursion
   * outside the root cannot hide behind prefix translation.
   */
  readonly rootAliases?: readonly string[];
}

/**
 * The probe is REQUIRED, not defaulted.
 *
 * This module performs no I/O of its own: the only module in the package allowed
 * to import `node:fs` is node-adapter.ts, which supplies the real implementation.
 * A missing probe is a programming error, reported as such rather than silently
 * falling back to something that cannot work.
 */
function requireProbe(options: PhysicalConfinementOptions): PhysicalProbe {
  const probe = options.probe;
  if (probe === undefined) {
    throw invalidInput("physical confinement requires a filesystem probe");
  }
  return probe;
}

/**
 * Normalize a canonical path for comparison. Only ever applied to paths already
 * returned by `realpath`, so this is a comparison aid, not a security decision.
 */
function comparable(path: string, caseInsensitive: boolean): string {
  const normalized = normalize(path);
  // Strip a single trailing separator so `/a/b/` and `/a/b` compare equal, but
  // never strip a filesystem root's separator (`/` or `C:\`).
  const root = parse(normalized).root;
  const trimmed =
    normalized.length > root.length && normalized.endsWith(sep)
      ? normalized.slice(0, -1)
      : normalized;
  return caseInsensitive ? trimmed.toLowerCase() : trimmed;
}

/**
 * True when `inner` is the same as, or nested inside, `outer`. BOTH must already
 * be canonical (realpath output).
 *
 * Compares SEGMENT BY SEGMENT rather than delegating to `relative()`. Two reasons,
 * and the second is a real cross-platform defect:
 *
 *   1. A prefix test would accept `/data/store-evil` as inside `/data/store`,
 *      since the former does begin with the latter's characters. Segment equality
 *      cannot make that mistake.
 *   2. `path.win32.relative` FOLDS CASE. So on Windows
 *      `relative("\\data\\Store", "\\data\\store\\a")` returns `"a"`, and an
 *      explicit `caseInsensitive: false` request was silently answered as if it
 *      were `true` -- the function accepted a case variant as contained even when
 *      the caller had asked for exact matching. Comparing segments with the
 *      caller's own case rule honours the flag on every platform.
 *
 * Case folding remains the correct DEFAULT on macOS and Windows, where `STORE` and
 * `store` genuinely are the same directory; the point is that the caller decides,
 * and now that decision is actually respected.
 */
export function isPhysicallyInside(
  outer: string,
  inner: string,
  caseInsensitive: boolean = CASE_INSENSITIVE_DEFAULT,
): boolean {
  const outerKey = comparable(outer, caseInsensitive);
  const innerKey = comparable(inner, caseInsensitive);
  if (outerKey === innerKey) return true;

  // A path that is not on the same filesystem root cannot be contained.
  const outerParsed = parse(outerKey);
  const innerParsed = parse(innerKey);
  if (outerParsed.root !== innerParsed.root) return false;

  const outerSegments = splitSegments(outerKey);
  const innerSegments = splitSegments(innerKey);
  // `inner` must be strictly deeper: equal depth was handled by the key equality
  // above, and a shallower path can never be nested inside a deeper one.
  if (innerSegments.length <= outerSegments.length) return false;
  for (const [index, segment] of outerSegments.entries()) {
    if (innerSegments[index] !== segment) return false;
  }
  // No traversal token may appear below the root. `comparable` normalizes first,
  // so a resolvable `..` is already gone; anything left is an escape attempt.
  return !innerSegments.slice(outerSegments.length).includes("..");
}

/** The non-root segments of an already-normalized path. */
function splitSegments(normalizedPath: string): string[] {
  const { root } = parse(normalizedPath);
  return normalizedPath
    .slice(root.length)
    .split(sep)
    .filter((segment) => segment.length > 0);
}

/**
 * Split an absolute path into the chain of paths from the filesystem root down
 * to the path itself: `/a/b/c` -> ["/a", "/a/b", "/a/b/c"].
 */
function ancestorChain(target: string): string[] {
  const normalized = resolve(normalize(target));
  const { root } = parse(normalized);
  const rest = normalized.slice(root.length);
  const segments = rest.split(sep).filter((segment) => segment.length > 0);
  const chain: string[] = [];
  let current = root;
  for (const segment of segments) {
    current = current.endsWith(sep) ? `${current}${segment}` : `${current}${sep}${segment}`;
    chain.push(current);
  }
  return chain;
}

/** Node's ENOENT / ENOTDIR, meaning "this path does not exist (yet)". */
function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * The canonical (physical) form of the governed store root.
 *
 * The root itself is verified. A root that is itself a link is legitimate -- a
 * user may place their application-data directory behind one -- so what matters
 * is that everything below it stays inside the root's PHYSICAL location, which
 * is what this returns.
 *
 * The root does NOT have to exist yet: the store creates its own data root on
 * first commit, so refusing a missing root would break every first write. In
 * that case the root is canonicalized through its nearest EXISTING ancestor,
 * which is itself verified, and the not-yet-created tail is appended lexically.
 * That tail cannot lie about its physical location, because a path that does not
 * exist cannot be a link.
 */
export async function canonicalizeRoot(
  root: string,
  options: PhysicalConfinementOptions = {},
): Promise<string> {
  if (!isAbsolute(root)) {
    throw pathEscape("the store root must be an absolute path");
  }
  const probe = requireProbe(options);
  const normalized = resolve(normalize(root));
  try {
    return await probe.realpath(normalized);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }

  // Walk upwards to the nearest existing ancestor and canonicalize THAT, then
  // re-append the missing tail.
  const chain = ancestorChain(normalized);
  const { root: fsRoot } = parse(normalized);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index] as string;
    let resolved: string;
    try {
      resolved = await probe.realpath(candidate);
    } catch (err) {
      if (isMissing(err)) continue;
      throw err;
    }
    const tail = normalized.slice(candidate.length);
    return tail.length > 0 ? `${resolved}${tail}` : resolved;
  }

  // Nothing along the path exists, not even a mount point. Fall back to the
  // filesystem root, which always exists.
  const resolvedFsRoot = await probe.realpath(fsRoot);
  return `${resolvedFsRoot}${normalized.slice(fsRoot.length)}`;
}

/**
 * Validate that `target` is physically confined below `canonicalRoot`, and
 * return the physical path that a write should use.
 *
 * `canonicalRoot` must already be the output of `canonicalizeRoot`.
 *
 * The procedure:
 *
 *   1. Re-anchor the target on the canonical root. The comparison must be
 *      canonical-vs-canonical, never canonical-vs-lexical: on macOS `/var` is
 *      itself a symlink to `/private/var`, so comparing a realpath'd root against
 *      a raw incoming path would reject every legitimate write under the system
 *      temp directory. Only the root PREFIX is translated -- the segments below it
 *      stay unresolved, so step 2 can still inspect each one.
 *   2. Walk those segments one at a time, from the root downwards, following at
 *      most ONE link level per step and re-checking containment after every step.
 *      This is what catches an ancestor symlink, a Windows junction, or any other
 *      reparse point, including one nested several levels up, and including the
 *      case where the escaped ancestor is a directory and the leaf below it looks
 *      entirely safe.
 *   3. Stop descending at the first segment that does not exist. Everything below
 *      a nonexistent path is necessarily nonexistent, and a nonexistent path
 *      cannot be a link, so the nearest existing parent is the last thing that
 *      can lie about its location -- and it has just been verified.
 *
 * A nonexistent target therefore inherits the verdict of its nearest existing
 * parent, which is the whole point: creating a file under an escaped parent
 * writes outside the store just as surely as writing through an escaped leaf.
 *
 * Step 2 is deliberately NOT a single `realpath` of the target. `realpath`
 * collapses an entire chain, so a route that leaves the root and comes back --
 * `<root>/hop -> <outside>/back -> <root>/real` -- resolves to a path inside the
 * root and would be accepted, even though the write physically travels through a
 * directory the store does not govern. Checking after each hop rejects it.
 */
export async function assertPhysicallyConfined(
  canonicalRoot: string,
  target: string,
  options: PhysicalConfinementOptions = {},
): Promise<string> {
  const caseInsensitive = options.caseInsensitive ?? CASE_INSENSITIVE_DEFAULT;

  if (!isAbsolute(target)) {
    throw pathEscape("a managed path must be absolute");
  }

  // Re-anchor the target on the CANONICAL root before walking. The caller passes
  // a path built from the configured (possibly non-canonical) root -- on macOS
  // `/var/...` where the canonical form is `/private/var/...` -- so the segments
  // below the root must be lifted onto the canonical root first. Everything after
  // this point compares canonical against canonical.
  const anchored = await anchorOnRoot(canonicalRoot, target, caseInsensitive, options);

  // Resolve segment by segment, following at most one link level at a time and
  // re-checking containment after EVERY step. `realpath` alone is not enough: it
  // collapses an entire chain, so a route that leaves the root and comes back
  // would look identical to one that never left.
  const physical = await resolveStepwise(canonicalRoot, anchored, caseInsensitive, options);

  if (!isPhysicallyInside(canonicalRoot, physical, caseInsensitive)) {
    throw escapeError();
  }
  return physical;
}

/** Bound on link hops, so a link cycle fails instead of looping forever. */
const MAX_LINK_HOPS = 40;

/**
 * Walk `target` one segment at a time from the canonical root downwards,
 * resolving each link level explicitly and requiring containment at every step.
 *
 * Why step-by-step rather than a single `realpath`:
 *
 *   * `realpath` collapses the whole chain. A route like
 *     `<root>/hop -> <outside>/back -> <root>/real` collapses to `<root>/real`,
 *     which IS inside the root -- so a single resolution accepts a write that
 *     physically travels through a directory the store does not govern. Checking
 *     after each hop rejects it.
 *   * A segment that does not exist cannot be a link, so the walk stops
 *     descending there and the remaining tail is confined by construction. That
 *     is what validates a not-yet-created target through its nearest existing
 *     parent.
 *
 * Junctions and other Windows reparse points are handled by the same code path:
 * `readOneLink` reports them as links, so they are resolved and re-checked
 * exactly like a POSIX symlink rather than being mistaken for plain directories.
 */
async function resolveStepwise(
  canonicalRoot: string,
  target: string,
  caseInsensitive: boolean,
  options: PhysicalConfinementOptions,
): Promise<string> {
  const probe = requireProbe(options);
  const segments = segmentsBelow(canonicalRoot, target, caseInsensitive);

  let current = canonicalRoot;
  let hops = 0;
  const pending = [...segments];

  while (pending.length > 0) {
    const segment = pending.shift() as string;
    const candidate = joinSegment(current, segment);

    // Containment BEFORE resolving: a `..` that climbs out is refused here even
    // if some link below would have brought it back.
    if (!isPhysicallyInside(canonicalRoot, candidate, caseInsensitive)) {
      throw escapeError();
    }

    let linkTarget: string | null;
    try {
      linkTarget = await probe.readOneLink(candidate);
    } catch (err) {
      if (isMissing(err)) {
        // This segment does not exist, so neither does anything below it, and a
        // nonexistent path cannot be a link. The parent was already validated on
        // the previous iteration, so the remaining tail is confined.
        return pending.length === 0 ? candidate : joinSegments(candidate, pending);
      }
      throw err;
    }

    if (linkTarget === null) {
      current = candidate;
      continue;
    }

    hops += 1;
    if (hops > MAX_LINK_HOPS) {
      // A cycle, or a chain too deep to be legitimate. Refuse rather than spin.
      throw escapeError();
    }

    // Resolve ONE hop. A relative link target resolves against the link's own
    // parent directory, exactly as the kernel would resolve it.
    const hopped = isAbsolute(linkTarget)
      ? resolve(normalize(linkTarget))
      : resolve(dirname(candidate), linkTarget);

    // The hop's destination must itself be inside the root. THIS is the check
    // that rejects an excursion which would later return: it fires on the
    // outward hop, before anything brings the path back in.
    //
    // A link's recorded target is whatever string was stored, typically a
    // non-canonical path -- on macOS a target inside the system temp directory
    // reads `/var/...` where the canonical root is `/private/var/...`. So the
    // destination's own PARENT is canonicalized (its parent is a directory that
    // already exists, and canonicalizing it cannot skip past the destination
    // itself), and the final segment is re-attached unresolved. The destination's
    // own link, if any, is therefore still resolved on a later iteration -- an
    // excursion cannot hide behind prefix translation.
    const hoppedInside = await canonicalizeParentOf(hopped, options);

    // Continue from the hop destination with the remaining segments. The
    // destination is re-examined, so a chain of links is resolved hop by hop.
    current = canonicalRoot;
    pending.unshift(...segmentsBelow(canonicalRoot, hoppedInside, caseInsensitive));
  }

  return current;
}

/**
 * Express `target` as a path anchored on the CANONICAL root.
 *
 * The store builds paths from its configured data root, which need not be
 * canonical. Canonicalizing the target wholesale is not an option here -- that
 * would collapse exactly the link chain this module must inspect hop by hop -- so
 * only the ROOT PREFIX is translated: the configured root's canonical form is
 * computed, the target's segments below the root are taken verbatim, and the two
 * are joined. A target that is not below the root at all is refused.
 */
async function anchorOnRoot(
  canonicalRoot: string,
  target: string,
  caseInsensitive: boolean,
  options: PhysicalConfinementOptions,
): Promise<string> {
  const normalized = resolve(normalize(target));
  // Already expressed on the canonical root: nothing to translate.
  if (isPhysicallyInside(canonicalRoot, normalized, caseInsensitive)) return normalized;

  // Otherwise the target may be anchored on a non-canonical spelling of the same
  // root. Translate ONLY the root prefix: take the segments the target has below
  // the CONFIGURED root and re-attach them to the canonical root, leaving every
  // one of them unresolved so the stepwise walk still inspects each in turn.
  for (const alias of options.rootAliases ?? []) {
    if (isPhysicallyInside(alias, normalized, caseInsensitive)) {
      return joinSegments(canonicalRoot, segmentsBelow(alias, normalized, caseInsensitive));
    }
  }
  throw escapeError();
}

/**
 * Canonicalize a path's PARENT directory while leaving its final segment
 * unresolved.
 *
 * Used on a link's destination. Canonicalizing the destination wholesale would
 * collapse the rest of the chain and hide an excursion outside the root; leaving
 * it entirely unresolved would misjudge a legitimate destination whose ancestors
 * are spelled non-canonically (macOS `/var` vs `/private/var`). Resolving only
 * the parent gets both right: the parent is an existing directory, so resolving
 * it cannot jump past the destination, and the destination's own link is still
 * inspected on the next iteration of the walk.
 *
 * A parent that does not exist is returned as-is: a nonexistent path cannot be a
 * link, so there is nothing to canonicalize.
 */
async function canonicalizeParentOf(
  target: string,
  options: PhysicalConfinementOptions,
): Promise<string> {
  const probe = requireProbe(options);
  const normalized = resolve(normalize(target));
  const parentDir = dirname(normalized);
  if (parentDir === normalized) return normalized;
  try {
    const canonicalParent = await probe.realpath(parentDir);
    return joinSegment(canonicalParent, basename(normalized));
  } catch (err) {
    if (isMissing(err)) return normalized;
    throw err;
  }
}

/** The absolute path's segments, without its filesystem root. */
function pathSegments(absolutePath: string): string[] {
  const normalized = resolve(normalize(absolutePath));
  return normalized
    .slice(parse(normalized).root.length)
    .split(sep)
    .filter((segment) => segment.length > 0);
}

/**
 * The segments of `target` below `root`. Both must be expressed on the same root.
 * Throws the sanitized escape error when `target` is not inside `root`.
 */
function segmentsBelow(root: string, target: string, caseInsensitive: boolean): string[] {
  const normalized = resolve(normalize(target));
  if (!isPhysicallyInside(root, normalized, caseInsensitive)) {
    throw escapeError();
  }
  const rootDepth = pathSegments(root).length;
  // Take the tail from the ORIGINAL path so case folding used only for the
  // comparison never leaks into the path actually written.
  return pathSegments(normalized).slice(rootDepth);
}

/** Append one segment to a path. */
function joinSegment(base: string, segment: string): string {
  return resolve(normalize(base.endsWith(sep) ? `${base}${segment}` : `${base}${sep}${segment}`));
}

/** Append several segments to a path. */
function joinSegments(base: string, segments: readonly string[]): string {
  let out = base;
  for (const segment of segments) out = joinSegment(out, segment);
  return out;
}

/**
 * The single sanitized escape error. Deliberately identical for every rejection
 * reason and carrying NO path: an error that echoed the escaped absolute
 * location would disclose filesystem layout outside the store to whatever reads
 * it, and would let a caller probe for the existence of paths it cannot see.
 */
function escapeError(): Error {
  return pathEscape(
    "a managed path resolves outside the store root",
    "the store writes only inside its own data root",
  );
}

/** Exported for tests that pin both case-sensitivity behaviours explicitly. */
export { CASE_INSENSITIVE_DEFAULT };
