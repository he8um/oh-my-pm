// The nested `memory` command parser.
//
// A dedicated grammar for the eight `memory` subcommands, kept out of the flat
// CLI loop. Pure: no filesystem, environment, network, or clock access. Every value
// is validated here; duplicate options, missing values, control characters, and
// mutation-only options on read commands are rejected. The project root and any
// destination are passed through exactly as typed and never normalized.

import type { CliOutputMode } from "@oh-my-pm/contracts";
import {
  MEMORY_DEFAULT_HISTORY_LIMIT,
  MEMORY_DEFAULT_LOCALE,
  MEMORY_DEFAULT_STALE_AFTER_SECONDS,
  MEMORY_DEFAULT_TIMELINE_LIMIT,
  MEMORY_MAX_HISTORY_LIMIT,
  MEMORY_MAX_STALE_AFTER_SECONDS,
  MEMORY_MAX_TIMELINE_LIMIT,
  MEMORY_MIN_HISTORY_LIMIT,
  MEMORY_MIN_STALE_AFTER_SECONDS,
  MEMORY_MIN_TIMELINE_LIMIT,
  MEMORY_SUBCOMMANDS,
  MEMORY_TIMELINE_CATEGORIES,
  MEMORY_TIMELINE_KINDS,
} from "@oh-my-pm/application";
import type { ChangeCategory, StateItemKind } from "@oh-my-pm/contracts";
import type {
  MemoryCliCommand,
  MemoryCliParseResult,
  MemoryLocale,
  MemorySubcommand,
} from "@oh-my-pm/application";

const OMP_C_INVALID_OPTION = "OMP-C-3002";

type ParseError = { ok: false; code: "OMP-C-3002"; message: string };

function fail(message: string): ParseError {
  return { ok: false, code: OMP_C_INVALID_OPTION, message };
}

/** Reject a string containing an ASCII control character (0x00–0x1f or 0x7f). */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Take a single value for the option at index `i`. Rejects a duplicate (when
 * `current` is already set), a missing value, a value that looks like another
 * option (`--…`), and a value carrying control characters. Returns the value and
 * the advanced index, or a parse error.
 */
function takeValue(
  rest: readonly string[],
  i: number,
  current: unknown,
  option: string,
): { value: string; next: number } | { error: ParseError } {
  if (current !== null && current !== undefined) {
    return { error: fail(`duplicate ${option}`) };
  }
  const value = rest[i + 1];
  if (value === undefined || value.startsWith("--")) {
    return { error: fail(`${option} requires a value`) };
  }
  if (hasControlCharacter(value)) {
    return { error: fail(`${option} must not contain control characters`) };
  }
  return { value, next: i + 1 };
}

/** A bounded non-negative integer option, strictly validated. */
function takeIntegerValue(
  rest: readonly string[],
  i: number,
  current: number | null,
  option: string,
  min: number,
  max: number,
): { value: number; next: number } | { error: ParseError } {
  const taken = takeValue(rest, i, current, option);
  if ("error" in taken) return taken;
  if (!/^[0-9]+$/.test(taken.value)) {
    return { error: fail(`${option} must be a non-negative integer`) };
  }
  const parsed = Number(taken.value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { error: fail(`${option} must be in ${min}..${max}`) };
  }
  return { value: parsed, next: taken.next };
}

/** Fields shared by every subcommand, accumulated during the parse loop. */
type CommonAccumulator = {
  projectId: string | null;
  dataDir: string | null;
  outputMode: CliOutputMode;
  positionalRoots: string[];
};

/** The mutation flag (`--apply`) is accepted only by capture/export/delete. */
const APPLY_SUBCOMMANDS: ReadonlySet<MemorySubcommand> = new Set([
  "capture",
  "export",
  "delete",
  // v0.6.2: repair is preview-first with the same explicit --apply gate.
  "repair",
]);

/**
 * Parse `memory <subcommand> [root] [options…]`. Options may appear anywhere
 * after the subcommand. Exactly one optional positional project root is allowed.
 */
export function parseMemoryCommand(rest: readonly string[]): MemoryCliParseResult {
  let subcommand: MemorySubcommand | null = null;

  const common: CommonAccumulator = {
    projectId: null,
    dataDir: null,
    outputMode: "brief",
    positionalRoots: [],
  };

  // Subcommand-specific accumulators.
  let locale: MemoryLocale | null = null;
  let apply = false;
  let previous: string | null = null;
  let current: string | null = null;
  let staleAfter: number | null = null;
  let limit: number | null = null;
  let destination: string | null = null;
  let confirm: string | null = null;
  let forceCorruptDelete = false;
  let migrateStore = false;
  let beforeSequence: number | null = null;
  let category: ChangeCategory | null = null;
  let kind: StateItemKind | null = null;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;

    if (arg === "--json" || arg === "--markdown") {
      common.outputMode = arg === "--json" ? "json" : "markdown";
      continue;
    }
    if (arg === "--project-id") {
      const taken = takeValue(rest, i, common.projectId, "--project-id");
      if ("error" in taken) return taken.error;
      common.projectId = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--data-dir") {
      const taken = takeValue(rest, i, common.dataDir, "--data-dir");
      if ("error" in taken) return taken.error;
      common.dataDir = taken.value;
      i = taken.next;
      continue;
    }

    // Options accepted only by specific subcommands. Reject them before the
    // subcommand is known, or on the wrong subcommand, so misuse fails closed.
    if (arg === "--apply") {
      if (subcommand === null || !APPLY_SUBCOMMANDS.has(subcommand)) {
        return fail("--apply is only valid for capture, export, delete, or repair");
      }
      if (apply) return fail("duplicate --apply");
      apply = true;
      continue;
    }
    if (arg === "--force-corrupt-delete") {
      if (subcommand !== "delete") {
        return fail("--force-corrupt-delete is only valid for delete");
      }
      if (forceCorruptDelete) return fail("duplicate --force-corrupt-delete");
      forceCorruptDelete = true;
      continue;
    }
    if (arg === "--migrate-store") {
      // Explicit store-format 1 -> 2 migration opt-in. Valid ONLY for capture
      // (the existing preview/apply write boundary); rejected on every other
      // subcommand and before the subcommand is known, so misuse fails closed.
      if (subcommand !== "capture") {
        return fail("--migrate-store is only valid for capture");
      }
      if (migrateStore) return fail("duplicate --migrate-store");
      migrateStore = true;
      continue;
    }
    if (arg === "--confirm") {
      if (subcommand !== "delete") {
        return fail("--confirm is only valid for delete");
      }
      const taken = takeValue(rest, i, confirm, "--confirm");
      if ("error" in taken) return taken.error;
      confirm = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--locale") {
      if (subcommand !== "capture") {
        return fail("--locale is only valid for capture");
      }
      const taken = takeValue(rest, i, locale, "--locale");
      if ("error" in taken) return taken.error;
      if (taken.value !== "en" && taken.value !== "fa") {
        return fail("--locale must be en or fa");
      }
      locale = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--previous") {
      if (subcommand !== "changes") {
        return fail("--previous is only valid for changes");
      }
      const taken = takeValue(rest, i, previous, "--previous");
      if ("error" in taken) return taken.error;
      previous = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--current") {
      if (subcommand !== "changes") {
        return fail("--current is only valid for changes");
      }
      const taken = takeValue(rest, i, current, "--current");
      if ("error" in taken) return taken.error;
      current = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--stale-after") {
      if (subcommand !== "changes") {
        return fail("--stale-after is only valid for changes");
      }
      const taken = takeIntegerValue(
        rest,
        i,
        staleAfter,
        "--stale-after",
        MEMORY_MIN_STALE_AFTER_SECONDS,
        MEMORY_MAX_STALE_AFTER_SECONDS,
      );
      if ("error" in taken) return taken.error;
      staleAfter = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--limit") {
      if (subcommand !== "history" && subcommand !== "timeline") {
        return fail("--limit is only valid for history or timeline");
      }
      const [min, max] =
        subcommand === "timeline"
          ? [MEMORY_MIN_TIMELINE_LIMIT, MEMORY_MAX_TIMELINE_LIMIT]
          : [MEMORY_MIN_HISTORY_LIMIT, MEMORY_MAX_HISTORY_LIMIT];
      const taken = takeIntegerValue(rest, i, limit, "--limit", min, max);
      if ("error" in taken) return taken.error;
      limit = taken.value;
      i = taken.next;
      continue;
    }
    // Timeline-only read options. Rejected before the subcommand is known and on
    // every other subcommand, so misuse fails closed.
    if (arg === "--before-sequence") {
      if (subcommand !== "timeline") {
        return fail("--before-sequence is only valid for timeline");
      }
      const taken = takeIntegerValue(
        rest,
        i,
        beforeSequence,
        "--before-sequence",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      if ("error" in taken) return taken.error;
      beforeSequence = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--category") {
      if (subcommand !== "timeline") {
        return fail("--category is only valid for timeline");
      }
      const taken = takeValue(rest, i, category, "--category");
      if ("error" in taken) return taken.error;
      if (!(MEMORY_TIMELINE_CATEGORIES as readonly string[]).includes(taken.value)) {
        return fail(`--category must be one of ${MEMORY_TIMELINE_CATEGORIES.join(", ")}`);
      }
      category = taken.value as ChangeCategory;
      i = taken.next;
      continue;
    }
    if (arg === "--kind") {
      if (subcommand !== "timeline") {
        return fail("--kind is only valid for timeline");
      }
      const taken = takeValue(rest, i, kind, "--kind");
      if ("error" in taken) return taken.error;
      if (!(MEMORY_TIMELINE_KINDS as readonly string[]).includes(taken.value)) {
        return fail(`--kind must be one of ${MEMORY_TIMELINE_KINDS.join(", ")}`);
      }
      kind = taken.value as StateItemKind;
      i = taken.next;
      continue;
    }
    if (arg === "--destination") {
      if (subcommand !== "export") {
        return fail("--destination is only valid for export");
      }
      const taken = takeValue(rest, i, destination, "--destination");
      if ("error" in taken) return taken.error;
      destination = taken.value;
      i = taken.next;
      continue;
    }

    if (arg.startsWith("--")) {
      return fail(`unsupported option: ${arg}`);
    }

    // Positional tokens: the subcommand first, then one optional project root.
    if (subcommand === null) {
      if (!(MEMORY_SUBCOMMANDS as readonly string[]).includes(arg)) {
        return fail(`unsupported memory subcommand: ${arg}`);
      }
      subcommand = arg as MemorySubcommand;
      continue;
    }
    common.positionalRoots.push(arg);
  }

  if (subcommand === null) {
    return fail("missing memory subcommand");
  }
  if (common.positionalRoots.length > 1) {
    return fail("only one project root is allowed");
  }
  const projectRoot = common.positionalRoots[0] ?? ".";

  // Per-subcommand assembly with the remaining validation.
  const commonFields = {
    ...(common.projectId !== null ? { projectId: common.projectId } : {}),
    ...(common.dataDir !== null ? { dataDir: common.dataDir } : {}),
    outputMode: common.outputMode,
  };

  let command: MemoryCliCommand;
  switch (subcommand) {
    case "capture":
      command = {
        subcommand: "capture",
        projectRoot,
        locale: locale ?? MEMORY_DEFAULT_LOCALE,
        apply,
        migrateStore,
        ...commonFields,
      };
      break;
    case "changes": {
      // previous/current must be supplied together and must differ.
      if ((previous === null) !== (current === null)) {
        return fail("--previous and --current must be supplied together");
      }
      if (previous !== null && current !== null && previous === current) {
        return fail("--previous and --current must differ");
      }
      command = {
        subcommand: "changes",
        projectRoot,
        ...(previous !== null ? { previousSnapshotId: previous } : {}),
        ...(current !== null ? { currentSnapshotId: current } : {}),
        staleAfterSeconds: staleAfter ?? MEMORY_DEFAULT_STALE_AFTER_SECONDS,
        ...commonFields,
      };
      break;
    }
    case "status":
      command = { subcommand: "status", projectRoot, ...commonFields };
      break;
    case "history":
      command = {
        subcommand: "history",
        projectRoot,
        limit: limit ?? MEMORY_DEFAULT_HISTORY_LIMIT,
        ...commonFields,
      };
      break;
    case "export":
      if (destination === null) {
        return fail("--destination is required for export");
      }
      command = {
        subcommand: "export",
        projectRoot,
        destination,
        apply,
        ...commonFields,
      };
      break;
    case "delete":
      // Confirmation is mandatory with --apply and forbidden without it, so a
      // destructive apply always carries an explicit confirmation.
      if (apply && confirm === null) {
        return fail("delete --apply requires --confirm <project-id>");
      }
      if (!apply && confirm !== null) {
        return fail("--confirm is only valid together with --apply");
      }
      command = {
        subcommand: "delete",
        projectRoot,
        apply,
        ...(confirm !== null ? { confirm } : {}),
        forceCorruptDelete,
        ...commonFields,
      };
      break;
    case "repair":
      command = { subcommand: "repair", projectRoot, apply, ...commonFields };
      break;
    case "timeline":
      // timeline is identified purely by project id: it reads committed memory
      // and needs no project root. A positional root is therefore rejected
      // rather than silently ignored.
      if (common.positionalRoots.length > 0) {
        return fail("timeline takes no project root; identify the project with --project-id");
      }
      if (common.projectId === null) {
        return fail("--project-id is required for timeline");
      }
      command = {
        subcommand: "timeline",
        limit: limit ?? MEMORY_DEFAULT_TIMELINE_LIMIT,
        ...(beforeSequence !== null ? { beforeSequence } : {}),
        ...(category !== null ? { category } : {}),
        ...(kind !== null ? { kind } : {}),
        ...commonFields,
      };
      break;
  }

  return { ok: true, command };
}
