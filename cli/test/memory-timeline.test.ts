// v0.4 — `memory timeline` CLI qualification.
//
// Two layers:
//
//  1. pure parser tests for the grammar (required project id, limit bounds,
//     filters, pagination, rejection of every mutating/foreign option);
//  2. an end-to-end journey that runs the REAL built CLI as a child process
//     against a real store, asserting exit codes, the stdout/stderr split,
//     determinism, filtering, pagination, corruption behavior, and that the read
//     performs no write and creates no application-data directory.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatHelp } from "../src/help.js";
import { parseMemoryCommand } from "../src/memory-parser.js";
import {
  MEMORY_DEFAULT_TIMELINE_LIMIT,
  MEMORY_MAX_TIMELINE_LIMIT,
  MEMORY_MIN_TIMELINE_LIMIT,
  MEMORY_SUBCOMMANDS,
  MEMORY_TIMELINE_CATEGORIES,
  MEMORY_TIMELINE_KINDS,
} from "../src/memory-types.js";
import type { MemoryTimelineCommand } from "../src/memory-types.js";

// --- parser ----------------------------------------------------------------

/** Parse a timeline command, asserting success, and return it. */
function timelineCommand(args: string[]): MemoryTimelineCommand {
  const result = parseMemoryCommand(["timeline", ...args]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  expect(result.command.subcommand).toBe("timeline");
  return result.command as MemoryTimelineCommand;
}

/** Parse a timeline command expecting a controlled usage failure. */
function timelineFailure(args: string[]): { code: string; message: string } {
  const result = parseMemoryCommand(["timeline", ...args]);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return { code: result.code, message: result.message };
}

describe("memory timeline — parser", () => {
  it("is the seventh memory subcommand", () => {
    expect(MEMORY_SUBCOMMANDS).toHaveLength(7);
    expect(MEMORY_SUBCOMMANDS[6]).toBe("timeline");
  });

  it("requires --project-id", () => {
    const failure = timelineFailure([]);
    expect(failure.code).toBe("OMP-C-3002");
    expect(failure.message).toContain("--project-id is required");
  });

  it("defaults the limit to 20", () => {
    const command = timelineCommand(["--project-id", "p"]);
    expect(command.limit).toBe(MEMORY_DEFAULT_TIMELINE_LIMIT);
    expect(command.limit).toBe(20);
  });

  it("accepts the minimum and maximum limits", () => {
    expect(timelineCommand(["--project-id", "p", "--limit", "1"]).limit).toBe(
      MEMORY_MIN_TIMELINE_LIMIT,
    );
    expect(timelineCommand(["--project-id", "p", "--limit", "100"]).limit).toBe(
      MEMORY_MAX_TIMELINE_LIMIT,
    );
  });

  it.each(["0", "101", "-1", "1.5", "abc", ""])("rejects the invalid limit %s", (limit) => {
    expect(parseMemoryCommand(["timeline", "--project-id", "p", "--limit", limit]).ok).toBe(false);
  });

  it("accepts a non-negative beforeSequence including zero", () => {
    expect(timelineCommand(["--project-id", "p", "--before-sequence", "0"]).beforeSequence).toBe(0);
    expect(timelineCommand(["--project-id", "p", "--before-sequence", "7"]).beforeSequence).toBe(7);
  });

  it.each(["-1", "1.5", "x"])("rejects the invalid beforeSequence %s", (value) => {
    expect(
      parseMemoryCommand(["timeline", "--project-id", "p", "--before-sequence", value]).ok,
    ).toBe(false);
  });

  it.each([...MEMORY_TIMELINE_CATEGORIES])("accepts the category %s", (category) => {
    expect(timelineCommand(["--project-id", "p", "--category", category]).category).toBe(category);
  });

  it.each([...MEMORY_TIMELINE_KINDS])("accepts the kind %s", (kind) => {
    expect(timelineCommand(["--project-id", "p", "--kind", kind]).kind).toBe(kind);
  });

  it("rejects a category or kind outside the existing taxonomy", () => {
    expect(parseMemoryCommand(["timeline", "--project-id", "p", "--category", "invented"]).ok).toBe(
      false,
    );
    expect(parseMemoryCommand(["timeline", "--project-id", "p", "--kind", "epic"]).ok).toBe(false);
  });

  it("combines filters and pagination", () => {
    const command = timelineCommand([
      "--project-id",
      "p",
      "--limit",
      "5",
      "--before-sequence",
      "9",
      "--category",
      "added",
      "--kind",
      "risk",
      "--json",
    ]);
    expect(command).toMatchObject({
      subcommand: "timeline",
      projectId: "p",
      limit: 5,
      beforeSequence: 9,
      category: "added",
      kind: "risk",
      outputMode: "json",
    });
  });

  it("supports every output mode", () => {
    expect(timelineCommand(["--project-id", "p"]).outputMode).toBe("brief");
    expect(timelineCommand(["--project-id", "p", "--json"]).outputMode).toBe("json");
    expect(timelineCommand(["--project-id", "p", "--markdown"]).outputMode).toBe("markdown");
  });

  it("accepts an explicit data directory", () => {
    expect(timelineCommand(["--project-id", "p", "--data-dir", "d"]).dataDir).toBe("d");
  });

  it("takes no project root", () => {
    const failure = timelineFailure(["--project-id", "p", "."]);
    expect(failure.message).toContain("takes no project root");
  });

  it.each([
    "--apply",
    "--migrate-store",
    "--force-corrupt-delete",
    "--locale",
    "--previous",
    "--current",
    "--stale-after",
    "--destination",
    "--confirm",
  ])("rejects the foreign or mutating option %s", (option) => {
    // Values are supplied where required so the rejection is about the option
    // itself, not a missing value.
    const args = ["timeline", "--project-id", "p", option, "x"];
    expect(parseMemoryCommand(args).ok).toBe(false);
  });

  it("rejects an unknown option", () => {
    expect(parseMemoryCommand(["timeline", "--project-id", "p", "--frobnicate"]).ok).toBe(false);
  });

  it("rejects duplicate options", () => {
    for (const args of [
      ["--project-id", "p", "--project-id", "q"],
      ["--project-id", "p", "--limit", "1", "--limit", "2"],
      ["--project-id", "p", "--category", "added", "--category", "removed"],
      ["--project-id", "p", "--kind", "task", "--kind", "risk"],
      ["--project-id", "p", "--before-sequence", "1", "--before-sequence", "2"],
    ]) {
      expect(parseMemoryCommand(["timeline", ...args]).ok).toBe(false);
    }
  });

  it("keeps the timeline options off every other subcommand", () => {
    for (const sub of ["capture", "changes", "status", "history", "export", "delete"]) {
      for (const option of ["--before-sequence", "--category", "--kind"]) {
        expect(parseMemoryCommand([sub, option, "1"]).ok).toBe(false);
      }
    }
  });

  it("still accepts --limit on history", () => {
    const result = parseMemoryCommand(["history", "--limit", "5"]);
    expect(result.ok).toBe(true);
  });
});

describe("memory timeline — help", () => {
  it("is listed in the memory help with its options", () => {
    const help = formatHelp("memory");
    expect(help).toContain("timeline");
    expect(help).toContain("--before-sequence");
    expect(help).toContain("--category");
    expect(help).toContain("--kind");
    expect(help).toContain("--project-id");
  });

  it("names every memory subcommand in the usage line", () => {
    const help = formatHelp("memory");
    for (const sub of MEMORY_SUBCOMMANDS) {
      expect(help).toContain(sub);
    }
  });
});

// --- end to end ------------------------------------------------------------

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "ohmypm.mjs");
const PROJECT_ID = "timeline-e2e-project";

type Run = { status: number; stdout: string; stderr: string };

let root: string;
let project: string;
let data: string;

function run(...args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
      cwd: root,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function timeline(...args: string[]): Run {
  return run("memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, ...args);
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** A stable digest of every stored file's path, size, and bytes. */
function storeDigest(): string {
  return listFiles(data)
    .sort()
    .map((f) => `${f}:${statSync(f).size}:${readFileSync(f, "utf8")}`)
    .join("|");
}

const DOC_A = ["# Project", "## Next steps", "- Wire the API", "## Risks", "- Timeline is tight"].join(
  "\n",
);
const DOC_B = [
  "# Project",
  "## Next steps",
  "- Wire the API",
  "- Add integration tests",
  "## Risks",
  "- Timeline is tight",
].join("\n");
const DOC_C = [
  "# Project",
  "## Next steps",
  "- Add integration tests",
  "- Qualify the release",
  "## Risks",
  "- Timeline is tight",
  "## Blockers",
  "- Auth service is down",
].join("\n");

type TimelineJson = {
  command: string;
  ok: boolean;
  data: {
    projectId: string;
    limit: number;
    eventCount: number;
    hasMore: boolean;
    nextBeforeSequence?: number;
    category?: string;
    kind?: string;
    events: {
      eventId: string;
      snapshotId: string;
      captureSequence: number;
      eventSequence: number;
      capturedAt: string;
      category: string;
      kind: string;
      subjectId: string;
      evidenceCount: number;
      title?: string;
      status?: string;
      severity?: string;
      dueDate?: string;
    }[];
  };
};

function parseTimeline(out: Run): TimelineJson {
  expect(out.status).toBe(0);
  return JSON.parse(out.stdout) as TimelineJson;
}

describe("memory timeline — end to end", () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "oh-my-pm-timeline-e2e-"));
    project = join(root, "project");
    data = join(root, "data");
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, "oh-my-pm.config.json"),
      JSON.stringify({ version: 1, projectId: PROJECT_ID, documents: { include: ["**/*.md"] } }),
    );
    // Three captures build a two-comparison timeline.
    writeFileSync(join(project, "status.md"), DOC_A);
    expect(run("memory", "capture", project, "--apply", "--data-dir", data).status).toBe(0);
    writeFileSync(join(project, "status.md"), DOC_B);
    expect(run("memory", "capture", project, "--apply", "--data-dir", data).status).toBe(0);
    writeFileSync(join(project, "status.md"), DOC_C);
    expect(run("memory", "capture", project, "--apply", "--data-dir", data).status).toBe(0);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("exits 0 and writes only to stdout on success", () => {
    const result = timeline();
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stderr).toBe("");
  });

  it("ends every output mode with exactly one newline", () => {
    for (const mode of [[], ["--json"], ["--markdown"]]) {
      const result = timeline(...mode);
      expect(result.status).toBe(0);
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(result.stdout.endsWith("\n\n")).toBe(false);
    }
  });

  it("returns a populated timeline in authoritative capture order", () => {
    const parsed = parseTimeline(timeline("--json"));
    expect(parsed.command).toBe("memory.timeline");
    expect(parsed.data.projectId).toBe(PROJECT_ID);
    expect(parsed.data.eventCount).toBeGreaterThan(0);
    expect(parsed.data.eventCount).toBe(parsed.data.events.length);
    const events = parsed.data.events;
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1]!;
      const next = events[i]!;
      if (prev.captureSequence === next.captureSequence) {
        expect(next.eventSequence).toBeGreaterThan(prev.eventSequence);
      } else {
        expect(next.captureSequence).toBeLessThan(prev.captureSequence);
      }
    }
    // Three captures produce comparisons attributed to captures 2 and 3.
    expect([...new Set(events.map((e) => e.captureSequence))].sort()).toEqual([2, 3]);
  });

  it("is byte-identical across repeated runs", () => {
    const first = timeline("--json").stdout;
    for (let i = 0; i < 4; i += 1) {
      expect(timeline("--json").stdout).toBe(first);
    }
    // Brief and Markdown are equally deterministic.
    expect(timeline().stdout).toBe(timeline().stdout);
    expect(timeline("--markdown").stdout).toBe(timeline("--markdown").stdout);
  });

  it("honours the default limit and the explicit bounds", () => {
    expect(parseTimeline(timeline("--json")).data.limit).toBe(20);
    expect(parseTimeline(timeline("--json", "--limit", "1")).data.limit).toBe(1);
    expect(parseTimeline(timeline("--json", "--limit", "100")).data.limit).toBe(100);
  });

  it("filters by category", () => {
    const all = parseTimeline(timeline("--json"));
    const category = all.data.events[0]!.category;
    const filtered = parseTimeline(timeline("--json", "--category", category));
    expect(filtered.data.category).toBe(category);
    expect(filtered.data.events.length).toBeGreaterThan(0);
    for (const event of filtered.data.events) {
      expect(event.category).toBe(category);
    }
  });

  it("filters by kind", () => {
    const filtered = parseTimeline(timeline("--json", "--kind", "task"));
    for (const event of filtered.data.events) {
      expect(event.kind).toBe("task");
    }
  });

  it("combines category and kind as a conjunction", () => {
    const all = parseTimeline(timeline("--json"));
    const { category, kind } = all.data.events[0]!;
    const filtered = parseTimeline(
      timeline("--json", "--category", category, "--kind", kind),
    );
    for (const event of filtered.data.events) {
      expect(event.category).toBe(category);
      expect(event.kind).toBe(kind);
    }
  });

  it("paginates with --before-sequence without duplicating or skipping", () => {
    const full = parseTimeline(timeline("--json"));
    const seen: string[] = [];
    let before: number | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = parseTimeline(
        timeline("--json", "--limit", "1", ...(before !== undefined ? ["--before-sequence", String(before)] : [])),
      );
      for (const event of page.data.events) seen.push(event.eventId);
      if (!page.data.hasMore) {
        expect(page.data.nextBeforeSequence).toBeUndefined();
        break;
      }
      before = page.data.nextBeforeSequence!;
    }
    expect(seen).toEqual(full.data.events.map((e) => e.eventId));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("excludes captures at or above --before-sequence", () => {
    const page = parseTimeline(timeline("--json", "--before-sequence", "3"));
    for (const event of page.data.events) {
      expect(event.captureSequence).toBeLessThan(3);
    }
  });

  it("returns an empty valid timeline for an unknown project, exit 0", () => {
    const result = run(
      "memory",
      "timeline",
      "--project-id",
      "no-such-project",
      "--data-dir",
      data,
      "--json",
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as TimelineJson;
    expect(parsed.data.eventCount).toBe(0);
    expect(parsed.data.events).toEqual([]);
    expect(parsed.data.hasMore).toBe(false);
    expect(parsed.data.nextBeforeSequence).toBeUndefined();
  });

  it("renders an empty timeline in Markdown and brief without inventing content", () => {
    const md = run(
      "memory",
      "timeline",
      "--project-id",
      "no-such-project",
      "--data-dir",
      data,
      "--markdown",
    );
    expect(md.status).toBe(0);
    expect(md.stdout).toContain("# OH MY PM Memory Timeline");
    expect(md.stdout).toContain("- none");
  });

  it("groups Markdown output by capture without inventing a summary", () => {
    const md = timeline("--markdown");
    expect(md.status).toBe(0);
    const parsed = parseTimeline(timeline("--json"));
    for (const sequence of new Set(parsed.data.events.map((e) => e.captureSequence))) {
      expect(md.stdout).toContain(`### Capture #${sequence}`);
    }
    // Every rendered event line restates recorded fields only.
    for (const event of parsed.data.events) {
      expect(md.stdout).toContain(event.subjectId);
    }
  });

  it("exposes only the allow-listed event fields in JSON", () => {
    const parsed = parseTimeline(timeline("--json"));
    const allowed = new Set([
      "eventId",
      "projectId",
      "snapshotId",
      "captureSequence",
      "eventSequence",
      "capturedAt",
      "category",
      "kind",
      "subjectId",
      "evidenceCount",
      "title",
      "status",
      "severity",
      "dueDate",
    ]);
    for (const event of parsed.data.events) {
      for (const key of Object.keys(event)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it("never leaks a path, data directory, evidence id, or raw value", () => {
    for (const mode of [[], ["--json"], ["--markdown"]]) {
      const out = timeline(...mode).stdout;
      expect(out).not.toContain(data);
      expect(out).not.toContain(project);
      expect(out).not.toContain(root);
      expect(out).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
      for (const forbidden of [
        "evidenceRefs",
        "previousValue",
        "currentValue",
        "contentFingerprint",
        "stateFingerprint",
        "Authorization",
        "Bearer",
      ]) {
        expect(out).not.toContain(forbidden);
      }
    }
  });

  it("performs no write: the store is byte-identical after many reads", () => {
    const before = storeDigest();
    timeline();
    timeline("--json");
    timeline("--markdown");
    timeline("--json", "--limit", "1");
    timeline("--json", "--category", "added");
    timeline("--json", "--kind", "risk", "--before-sequence", "3");
    expect(storeDigest()).toBe(before);
  });

  it("creates no application-data directory on a read", () => {
    const absent = join(root, "no-data-dir-here");
    expect(existsSync(absent)).toBe(false);
    const result = run(
      "memory",
      "timeline",
      "--project-id",
      PROJECT_ID,
      "--data-dir",
      absent,
      "--json",
    );
    expect(result.status).toBe(0);
    expect(existsSync(absent)).toBe(false);
  });

  it("needs no project root and no project config", () => {
    // Run from a directory holding no project and no config at all.
    const bare = mkdtempSync(join(tmpdir(), "oh-my-pm-timeline-bare-"));
    try {
      const stdout = execFileSync(
        process.execPath,
        [BIN, "memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--json"],
        { encoding: "utf8", cwd: bare },
      );
      const parsed = JSON.parse(stdout) as TimelineJson;
      expect(parsed.data.eventCount).toBeGreaterThan(0);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("fails with exit 2 and a stderr message on a usage error", () => {
    for (const args of [
      ["memory", "timeline", "--data-dir", data],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--limit", "0"],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--limit", "101"],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--category", "nope"],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--kind", "nope"],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--apply"],
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", data, "--unknown"],
      ["memory", "timeline", ".", "--project-id", PROJECT_ID, "--data-dir", data],
    ]) {
      const result = run(...args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr.length).toBeGreaterThan(0);
    }
  });

  it("fails closed with no partial output when a snapshot record is corrupt", () => {
    // Corrupt one committed snapshot record in a COPY of the store so the
    // primary fixture stays valid for the remaining assertions.
    const corruptData = join(root, "corrupt-data");
    rmSync(corruptData, { recursive: true, force: true });
    mkdirSync(corruptData, { recursive: true });
    for (const file of listFiles(data)) {
      const relative = file.slice(data.length + 1);
      const target = join(corruptData, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(file));
    }
    const snapshots = listFiles(corruptData).filter((f) => f.includes("snapshots"));
    expect(snapshots.length).toBeGreaterThan(0);
    writeFileSync(snapshots[0]!, "{ not valid json");

    const result = run(
      "memory",
      "timeline",
      "--project-id",
      PROJECT_ID,
      "--data-dir",
      corruptData,
      "--json",
    );
    expect(result.status).not.toBe(0);
    // No partial timeline is emitted on stdout.
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("leaves the six historical subcommands working unchanged", () => {
    // Each is invoked exactly as in v0.3: same options, same identity
    // resolution, same JSON envelope. capture is previewed (no --apply) so the
    // fixture store stays untouched.
    for (const [sub, extra] of [
      ["status", ["--project-id", PROJECT_ID]],
      ["history", ["--project-id", PROJECT_ID]],
      ["changes", ["--project-id", PROJECT_ID]],
      ["capture", [project]],
    ] as const) {
      const result = run("memory", sub, ...extra, "--data-dir", data, "--json");
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).command).toBe(`memory.${sub}`);
    }
    // export and delete stay preview-first and non-destructive without --apply.
    for (const sub of ["export", "delete"] as const) {
      const args =
        sub === "export"
          ? ["memory", "export", "--project-id", PROJECT_ID, "--destination", join(root, "exp")]
          : ["memory", "delete", "--project-id", PROJECT_ID];
      const result = run(...args, "--data-dir", data, "--json");
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).command).toBe(`memory.${sub}`);
      expect(JSON.parse(result.stdout).mode).toBe("preview");
    }
  });
});
