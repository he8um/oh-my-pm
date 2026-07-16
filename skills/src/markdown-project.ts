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
