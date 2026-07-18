// Pure Skill-layer Markdown project extraction helpers. No Node imports and no
// filesystem access: this module analyzes already-loaded document bodies that
// arrive as generic provider items. Every function is deterministic and never
// mutates its input.

import type { TextItem } from "./types.js";

/** A heading and its extracted, human-readable content items, in document order. */
export type MarkdownProjectSection = {
  documentId: string;
  documentTitle: string;
  heading: string;
  normalizedHeading: string;
  items: string[];
};

/** An unchecked Markdown checklist entry with a stable per-document id. */
export type MarkdownUncheckedTask = {
  id: string;
  title: string;
};

const ATX_HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_LIST_ITEM = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_LIST_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const CHECKBOX_MARKER = /^\[[ xX]?\]\s*/;
const FENCE = /^\s*(```+|~~~+)/;
// Single-line unchecked checklist entries: -, *, or + bullets, optional leading
// whitespace, optional spaces inside the empty brackets, and a non-empty title.
// Checked entries ([x]/[X]) intentionally do not match.
const UNCHECKED_TASK_LINE = /^\s*[-*+]\s+\[\s*\]\s+(.+)$/;

/** Trim, lowercase, collapse internal whitespace, and drop a trailing colon. */
export function normalizeMarkdownHeading(value: string): string {
  const collapsed = value.trim().toLowerCase().replace(/\s+/g, " ");
  return collapsed.replace(/:$/, "");
}

/** A parsed section under construction while walking a document's lines. */
type SectionDraft = {
  heading: string;
  normalizedHeading: string;
  listItems: string[];
  paragraphs: string[];
  paragraphBuffer: string[];
};

function newDraft(heading: string): SectionDraft {
  return {
    heading,
    normalizedHeading: normalizeMarkdownHeading(heading),
    listItems: [],
    paragraphs: [],
    paragraphBuffer: [],
  };
}

/** Flush any buffered paragraph lines into one normalized paragraph item. */
function flushParagraph(draft: SectionDraft): void {
  if (draft.paragraphBuffer.length === 0) {
    return;
  }
  const merged = draft.paragraphBuffer.join(" ").replace(/\s+/g, " ").trim();
  draft.paragraphBuffer = [];
  if (merged !== "") {
    draft.paragraphs.push(merged);
  }
}

/**
 * Finalize a section's items. Plain paragraphs are narrative context: when a
 * section carries list or checkbox items, its paragraphs are treated as
 * preamble and omitted, so list-driven sections (risks, decisions, active
 * work) surface only their entries. Paragraph-only sections still emit their
 * merged paragraph text.
 */
function draftItems(draft: SectionDraft): string[] {
  flushParagraph(draft);
  return draft.listItems.length > 0 ? draft.listItems : draft.paragraphs;
}

/** Strip a leading checkbox marker from a list item's text, if present. */
function stripCheckbox(text: string): string {
  return text.replace(CHECKBOX_MARKER, "");
}

/**
 * Parse a generic item's Markdown body into ordered sections. Returns [] when
 * the body is absent. Fenced code blocks are ignored, an H1 opens a
 * document-level section, and any later heading replaces the current section.
 */
export function parseMarkdownProjectSections(item: TextItem): MarkdownProjectSection[] {
  if (item.body === undefined) {
    return [];
  }

  const sections: MarkdownProjectSection[] = [];
  let draft: SectionDraft | null = null;
  let fence: string | null = null;

  const commit = (): void => {
    if (draft === null) {
      return;
    }
    const items = draftItems(draft);
    sections.push({
      documentId: item.id,
      documentTitle: item.title,
      heading: draft.heading,
      normalizedHeading: draft.normalizedHeading,
      items,
    });
  };

  for (const line of item.body.split(/\r?\n/)) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch !== null) {
      const marker = (fenceMatch[1] ?? "").startsWith("~") ? "~~~" : "```";
      if (fence === null) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      // Fence lines themselves never contribute content.
      if (draft !== null) {
        flushParagraph(draft);
      }
      continue;
    }
    if (fence !== null) {
      // Inside a fenced code block: ignore all content.
      continue;
    }

    const headingMatch = ATX_HEADING.exec(line);
    if (headingMatch !== null) {
      commit();
      draft = newDraft((headingMatch[2] ?? "").trim());
      continue;
    }

    if (draft === null) {
      // Content before the first heading has no section; skip it.
      continue;
    }

    const unordered = UNORDERED_LIST_ITEM.exec(line);
    if (unordered !== null) {
      flushParagraph(draft);
      const text = stripCheckbox((unordered[1] ?? "").trim()).trim();
      if (text !== "") {
        draft.listItems.push(text);
      }
      continue;
    }

    const numbered = NUMBERED_LIST_ITEM.exec(line);
    if (numbered !== null) {
      flushParagraph(draft);
      const text = stripCheckbox((numbered[1] ?? "").trim()).trim();
      if (text !== "") {
        draft.listItems.push(text);
      }
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(draft);
      continue;
    }

    // A non-empty, non-marker line. When it directly follows a list item it is
    // a wrapped continuation of that entry; otherwise it accumulates into the
    // current paragraph.
    if (draft.paragraphBuffer.length === 0 && draft.listItems.length > 0) {
      const last = draft.listItems[draft.listItems.length - 1] ?? "";
      draft.listItems[draft.listItems.length - 1] = `${last} ${line.trim()}`
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    draft.paragraphBuffer.push(line.trim());
  }

  commit();
  return sections;
}

/**
 * Collect section items whose normalized heading exactly matches one of the
 * accepted headings, in input-item order then document-section order, deduped
 * by trimmed text (first occurrence wins). Never returns empty strings and
 * never mutates the input.
 */
export function collectMarkdownSectionItems(
  items: readonly TextItem[],
  acceptedHeadings: readonly string[],
): string[] {
  const accepted = new Set(acceptedHeadings.map((heading) => normalizeMarkdownHeading(heading)));
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const item of items) {
    for (const section of parseMarkdownProjectSections(item)) {
      if (!accepted.has(section.normalizedHeading)) {
        continue;
      }
      for (const raw of section.items) {
        const text = raw.trim();
        if (text === "" || seen.has(text)) {
          continue;
        }
        seen.add(text);
        collected.push(text);
      }
    }
  }
  return collected;
}

/**
 * Unchecked Markdown checklist entries across items, in item then line order.
 * Ids follow `<document-id>#task-<N>`, where N counts unchecked tasks within
 * each document. Checked entries and empty titles are ignored; no mutation.
 */
export function collectMarkdownUncheckedTasks(
  items: readonly TextItem[],
): MarkdownUncheckedTask[] {
  const tasks: MarkdownUncheckedTask[] = [];
  for (const item of items) {
    if (item.body === undefined) {
      continue;
    }
    let sequence = 0;
    for (const line of item.body.split(/\r?\n/)) {
      const match = UNCHECKED_TASK_LINE.exec(line);
      if (match === null) {
        continue;
      }
      const title = (match[1] ?? "").trim();
      if (title === "") {
        continue;
      }
      sequence += 1;
      tasks.push({ id: `${item.id}#task-${sequence}`, title });
    }
  }
  return tasks;
}

/** The first non-empty item title in input order, or undefined. */
export function inferMarkdownProjectTitle(items: readonly TextItem[]): string | undefined {
  for (const item of items) {
    const title = item.title.trim();
    if (title !== "") {
      return title;
    }
  }
  return undefined;
}

// --- Line-level signal parsing --------------------------------------------

/** One parsed, non-empty Markdown line relevant to signal extraction. */
export type MarkdownSignalEntry = {
  documentId: string;
  documentTitle: string;
  heading: string;
  normalizedHeading: string;
  line: number;
  sequence: number;
  kind:
    | "unchecked-task"
    | "checked-task"
    | "list-item"
    | "numbered-item"
    | "paragraph"
    | "marker";
  text: string;
};

// Explicit inline risk/action markers. Recognized only at the start of a line
// (after optional bullet syntax), requiring an exact prefix plus a colon.
export const MARKDOWN_RISK_MARKER_PREFIXES = [
  "risk",
  "blocker",
  "blocked by",
  "dependency",
  "concern",
  "known issue",
  "ریسک",
  "مانع",
  "مسدودکننده",
  "وابستگی",
  "نگرانی",
  "مشکل شناخته‌شده",
  "مشکل شناخته شده",
] as const;

export const MARKDOWN_ACTION_MARKER_PREFIXES = [
  "next",
  "next step",
  "action",
  "action item",
  "todo",
  "task",
  "بعدی",
  "گام بعدی",
  "اقدام",
  "اقدام بعدی",
  "کار",
  "وظیفه",
  "تسک",
] as const;

const CHECKED_TASK_LINE = /^\s*[-*+]\s+\[[xX]\]\s+(.+)$/;
const BULLET_PREFIX = /^\s*[-*+]\s+/;
const NUMBERED_PREFIX = /^\s*\d+[.)]\s+/;

/**
 * Detect an explicit `Prefix:` marker at the start of a value (already stripped
 * of any leading bullet syntax). Returns the recognized prefix and the non-empty
 * body, or null. Matching is exact prefix + colon (case-insensitive for ASCII);
 * arbitrary inline occurrences never match.
 */
function matchMarker(
  value: string,
  prefixes: readonly string[],
): { prefix: string; body: string } | null {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return null;
  const head = value.slice(0, colonIndex).trim();
  const normalizedHead = head.toLowerCase().replace(/\s+/g, " ");
  for (const prefix of prefixes) {
    if (normalizedHead === prefix) {
      const body = value.slice(colonIndex + 1).trim();
      if (body === "") return null;
      return { prefix, body };
    }
  }
  return null;
}

/** Recognize a risk marker on a line body (bullet already stripped). */
export function matchRiskMarker(value: string): { prefix: string; body: string } | null {
  return matchMarker(value, MARKDOWN_RISK_MARKER_PREFIXES);
}

/** Recognize an action marker on a line body (bullet already stripped). */
export function matchActionMarker(value: string): { prefix: string; body: string } | null {
  return matchMarker(value, MARKDOWN_ACTION_MARKER_PREFIXES);
}

/**
 * Parse a generic item's Markdown body into ordered, line-level signal entries.
 * One-based line numbers; document order preserved. Fenced code and fence
 * markers are ignored. Checkbox state is preserved. List continuation lines are
 * merged into the preceding entry. Empty items are ignored. Content before the
 * first heading is ignored except explicit markers. Never mutates the input.
 */
export function parseMarkdownSignalEntries(item: TextItem): MarkdownSignalEntry[] {
  if (item.body === undefined) {
    return [];
  }

  const entries: MarkdownSignalEntry[] = [];
  let heading = "";
  let normalizedHeading = "";
  let fence: string | null = null;
  let sequence = 0;
  let lastMergeable: MarkdownSignalEntry | null = null;

  const push = (line: number, kind: MarkdownSignalEntry["kind"], text: string): MarkdownSignalEntry => {
    sequence += 1;
    const entry: MarkdownSignalEntry = {
      documentId: item.id,
      documentTitle: item.title,
      heading,
      normalizedHeading,
      line,
      sequence,
      kind,
      text,
    };
    entries.push(entry);
    return entry;
  };

  const rawLines = item.body.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i] ?? "";
    const lineNumber = i + 1;

    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch !== null) {
      const marker = (fenceMatch[1] ?? "").startsWith("~") ? "~~~" : "```";
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      lastMergeable = null;
      continue;
    }
    if (fence !== null) {
      continue;
    }

    const headingMatch = ATX_HEADING.exec(raw);
    if (headingMatch !== null) {
      heading = (headingMatch[2] ?? "").trim();
      normalizedHeading = normalizeMarkdownHeading(heading);
      lastMergeable = null;
      continue;
    }

    if (raw.trim() === "") {
      lastMergeable = null;
      continue;
    }

    // Unchecked checklist entry.
    const uncheckedMatch = UNCHECKED_TASK_LINE.exec(raw);
    if (uncheckedMatch !== null) {
      const text = (uncheckedMatch[1] ?? "").trim();
      if (text !== "") lastMergeable = push(lineNumber, "unchecked-task", text);
      continue;
    }

    // Checked checklist entry.
    const checkedMatch = CHECKED_TASK_LINE.exec(raw);
    if (checkedMatch !== null) {
      const text = (checkedMatch[1] ?? "").trim();
      if (text !== "") lastMergeable = push(lineNumber, "checked-task", text);
      continue;
    }

    const bulletMatch = BULLET_PREFIX.exec(raw);
    const numberedMatch = NUMBERED_PREFIX.exec(raw);
    const listBody = bulletMatch !== null ? raw.slice(bulletMatch[0].length).trim() : undefined;
    const numberedBody =
      numberedMatch !== null ? raw.slice(numberedMatch[0].length).trim() : undefined;
    const inlineBody = listBody ?? numberedBody ?? raw.trim();

    // Explicit markers take precedence over generic list/paragraph handling,
    // and are recognized even before the first heading.
    const riskMarker = matchRiskMarker(inlineBody);
    const actionMarker = matchActionMarker(inlineBody);
    if (riskMarker !== null || actionMarker !== null) {
      const marker = (riskMarker ?? actionMarker) as { body: string };
      lastMergeable = push(lineNumber, "marker", marker.body);
      // Preserve the recognized prefix by re-reading it during classification;
      // store the full "Prefix: body" text so classifiers can re-derive it.
      entries[entries.length - 1]!.text = inlineBody;
      continue;
    }

    // Before the first heading, non-marker content is ignored.
    if (heading === "" && normalizedHeading === "") {
      lastMergeable = null;
      continue;
    }

    if (listBody !== undefined) {
      if (listBody !== "") lastMergeable = push(lineNumber, "list-item", listBody);
      continue;
    }
    if (numberedBody !== undefined) {
      if (numberedBody !== "") lastMergeable = push(lineNumber, "numbered-item", numberedBody);
      continue;
    }

    // A non-empty, non-marker, non-list line: merge into the preceding entry as
    // a wrapped continuation, otherwise start a paragraph entry.
    if (lastMergeable !== null) {
      lastMergeable.text = `${lastMergeable.text} ${raw.trim()}`.replace(/\s+/g, " ").trim();
      continue;
    }
    lastMergeable = push(lineNumber, "paragraph", raw.trim());
  }

  return entries;
}
