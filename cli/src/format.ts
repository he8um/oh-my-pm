import type { CliOutputMode, RuntimeResponse } from "@oh-my-pm/contracts";

type StatusData = { version: string; kernelVersion: string; healthy: boolean };
type DoctorCheck = { id: string; status: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStatusData(data: unknown): StatusData | null {
  if (!isRecord(data)) return null;
  const { version, kernelVersion, healthy } = data;
  if (typeof version !== "string" || typeof kernelVersion !== "string") return null;
  if (typeof healthy !== "boolean") return null;
  return { version, kernelVersion, healthy };
}

function asDoctorChecks(data: unknown): DoctorCheck[] | null {
  if (!isRecord(data) || !Array.isArray(data.checks)) return null;
  const checks: DoctorCheck[] = [];
  for (const entry of data.checks) {
    if (!isRecord(entry)) return null;
    const { id, status, message } = entry;
    if (typeof id !== "string" || typeof status !== "string" || typeof message !== "string") {
      return null;
    }
    checks.push({ id, status, message });
  }
  return checks;
}

function stringFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function arrayFrom(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

type RiskEntry = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

/** Strict risk-summary entries; null for any malformed shape. */
function asRiskEntries(value: unknown): RiskEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: RiskEntry[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const { id, title, severity, reason } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof reason !== "string") {
      return null;
    }
    if (severity !== "low" && severity !== "medium" && severity !== "high") {
      return null;
    }
    entries.push({ id, title, severity, reason });
  }
  return entries;
}

function riskEntriesBrief(entries: readonly RiskEntry[]): string {
  if (entries.length === 0) {
    return "OH MY PM risks: 0\nno risks detected\n";
  }
  return [
    `OH MY PM risks: ${entries.length}`,
    ...entries.map((entry) => `- [${entry.severity}] ${entry.title} — ${entry.reason}`),
    "",
  ].join("\n");
}

function riskEntriesMarkdown(entries: readonly RiskEntry[]): string {
  const bySeverity = (severity: RiskEntry["severity"]) =>
    entries.filter((entry) => entry.severity === severity).length;
  const riskLines =
    entries.length === 0
      ? ["- none"]
      : entries.map((entry) => `- **${entry.severity}** — ${entry.title} — \`${entry.reason}\``);
  return [
    "# OH MY PM Project Risks",
    "",
    "## Summary",
    "",
    `- Total: ${entries.length}`,
    `- High: ${bySeverity("high")}`,
    `- Medium: ${bySeverity("medium")}`,
    `- Low: ${bySeverity("low")}`,
    "",
    "## Risks",
    "",
    ...riskLines,
    "",
  ].join("\n");
}

type NextTaskEntry = {
  id: string;
  title: string;
  reason: string;
};

/** Strict next-task entries; null for any malformed shape. */
function asNextTaskEntries(value: unknown): NextTaskEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: NextTaskEntry[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const { id, title, reason } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof reason !== "string") {
      return null;
    }
    entries.push({ id, title, reason });
  }
  return entries;
}

function nextTaskEntriesBrief(entries: readonly NextTaskEntry[]): string {
  if (entries.length === 0) {
    return "OH MY PM next: 0\nno next tasks detected\n";
  }
  return [
    `OH MY PM next: ${entries.length}`,
    ...entries.map((entry) => `- ${entry.title} — ${entry.reason}`),
    "",
  ].join("\n");
}

function nextTaskEntriesMarkdown(entries: readonly NextTaskEntry[]): string {
  const taskLines =
    entries.length === 0
      ? ["- none"]
      : entries.map((entry) => `- ${entry.title} — \`${entry.reason}\``);
  return [
    "# OH MY PM Next Tasks",
    "",
    "## Summary",
    "",
    `- Total: ${entries.length}`,
    "",
    "## Tasks",
    "",
    ...taskLines,
    "",
  ].join("\n");
}

type SummaryCounts = { total: number; done: number; blocked: number; open: number };

function asSummaryCounts(value: unknown): SummaryCounts | null {
  if (!isRecord(value)) return null;
  const { total, done, blocked, open } = value;
  if (typeof total !== "number" || typeof done !== "number") return null;
  if (typeof blocked !== "number" || typeof open !== "number") return null;
  return { total, done, blocked, open };
}

function stringsFrom(value: unknown): string[] {
  const entries = arrayFrom(value) ?? [];
  const result: string[] = [];
  for (const entry of entries) {
    const text = stringFrom(entry);
    if (text !== undefined) {
      result.push(text);
    }
  }
  return result;
}

function titlesFrom(entries: readonly unknown[], key: string): string[] {
  const titles: string[] = [];
  for (const entry of entries) {
    if (isRecord(entry)) {
      const title = stringFrom(entry[key]);
      if (title !== undefined) {
        titles.push(title);
      }
    }
  }
  return titles;
}

function planBriefList(label: string, count: number, titles: readonly string[]): string {
  return ["OH MY PM plan: ok", `${label}: ${count}`, ...titles.map((t) => `- ${t}`), ""].join("\n");
}

function formatPlanBrief(output: Record<string, unknown>): string {
  const counts = asSummaryCounts(output["counts"]);
  if (counts !== null) {
    const highlights = stringsFrom(output["highlights"]);
    return [
      "OH MY PM plan: ok",
      `items: ${counts.total} (open ${counts.open}, blocked ${counts.blocked}, done ${counts.done})`,
      ...highlights.map((entry) => `- ${entry}`),
      "",
    ].join("\n");
  }
  const summary = stringFrom(output["summary"]);
  if (summary !== undefined) {
    return `OH MY PM plan: ok\n${summary}\n`;
  }
  const tasks = arrayFrom(output["tasks"]);
  if (tasks !== undefined) {
    const entries = asNextTaskEntries(tasks);
    if (entries !== null) {
      return nextTaskEntriesBrief(entries);
    }
    return planBriefList("tasks", tasks.length, titlesFrom(tasks, "title").slice(0, 5));
  }
  const risks = arrayFrom(output["risks"]);
  if (risks !== undefined) {
    const entries = asRiskEntries(risks);
    if (entries !== null) {
      return riskEntriesBrief(entries);
    }
    return planBriefList("risks", risks.length, titlesFrom(risks, "title").slice(0, 5));
  }
  const sections = arrayFrom(output["sections"]);
  if (sections !== undefined) {
    return planBriefList("sections", sections.length, titlesFrom(sections, "heading").slice(0, 5));
  }
  return "OH MY PM plan: ok\n";
}

function planMarkdownList(heading: string, titles: readonly string[]): string {
  return ["# OH MY PM Plan", "", `## ${heading}`, "", ...titles.map((t) => `- ${t}`), ""].join("\n");
}

function formatPlanMarkdown(output: Record<string, unknown>): string {
  const counts = asSummaryCounts(output["counts"]);
  if (counts !== null) {
    const highlights = stringsFrom(output["highlights"]);
    return [
      "# OH MY PM Plan",
      "",
      "## Status",
      "",
      `- Total: ${counts.total}`,
      `- Open: ${counts.open}`,
      `- Blocked: ${counts.blocked}`,
      `- Done: ${counts.done}`,
      "",
      "## Highlights",
      "",
      ...highlights.map((entry) => `- ${entry}`),
      "",
    ].join("\n");
  }
  const summary = stringFrom(output["summary"]);
  if (summary !== undefined) {
    return `# OH MY PM Plan\n\n${summary}\n`;
  }
  const tasks = arrayFrom(output["tasks"]);
  if (tasks !== undefined) {
    const entries = asNextTaskEntries(tasks);
    if (entries !== null) {
      return nextTaskEntriesMarkdown(entries);
    }
    return planMarkdownList("Tasks", titlesFrom(tasks, "title"));
  }
  const risks = arrayFrom(output["risks"]);
  if (risks !== undefined) {
    const entries = asRiskEntries(risks);
    if (entries !== null) {
      return riskEntriesMarkdown(entries);
    }
    return planMarkdownList("Risks", titlesFrom(risks, "title"));
  }
  const sections = arrayFrom(output["sections"]);
  if (sections !== undefined) {
    const lines = ["# OH MY PM Plan"];
    for (const entry of sections) {
      if (!isRecord(entry)) continue;
      const heading = stringFrom(entry["heading"]);
      if (heading === undefined) continue;
      lines.push("", `## ${heading}`, "");
      const items = arrayFrom(entry["items"]) ?? [];
      for (const item of items) {
        const text = stringFrom(item);
        if (text !== undefined) {
          lines.push(`- ${text}`);
        }
      }
    }
    lines.push("");
    return lines.join("\n");
  }
  return "# OH MY PM Plan\n\nOK\n";
}

function errorParts(response: RuntimeResponse): { code: string; message: string } {
  return {
    code: response.error?.code ?? "unknown",
    message: response.error?.message ?? "unknown error",
  };
}

function errorMarkdown(code: string, message: string): string {
  return `# OH MY PM Error\n\n- Code: ${code}\n- Message: ${message}\n`;
}

export function formatRuntimeResponse(response: RuntimeResponse, mode: CliOutputMode): string {
  if (mode === "json") {
    return `${JSON.stringify(response, null, 2)}\n`;
  }

  if (!response.ok) {
    const { code, message } = errorParts(response);
    if (mode === "markdown") {
      return errorMarkdown(code, message);
    }
    return `error ${code}: ${message}\n`;
  }

  const status = asStatusData(response.data);
  if (status !== null) {
    if (mode === "markdown") {
      return [
        "# OH MY PM Status",
        "",
        `- Healthy: ${status.healthy ? "yes" : "no"}`,
        `- Version: ${status.version}`,
        `- Kernel: ${status.kernelVersion}`,
        "",
      ].join("\n");
    }
    return [
      `OH MY PM status: ${status.healthy ? "healthy" : "unhealthy"}`,
      `version: ${status.version}`,
      `kernel: ${status.kernelVersion}`,
      "",
    ].join("\n");
  }

  const checks = asDoctorChecks(response.data);
  if (checks !== null) {
    if (mode === "markdown") {
      const rows = checks.map((check) => `| ${check.id} | ${check.status} | ${check.message} |`);
      return [
        "# OH MY PM Doctor",
        "",
        "| Check | Status | Message |",
        "| --- | --- | --- |",
        ...rows,
        "",
      ].join("\n");
    }
    const overall = checks.every((check) => check.status === "ok") ? "ok" : "attention";
    const lines = checks.map((check) => `${check.id}: ${check.status} - ${check.message}`);
    return [`OH MY PM doctor: ${overall}`, ...lines, ""].join("\n");
  }

  if (isRecord(response.data) && "output" in response.data) {
    const output = response.data["output"];
    if (isRecord(output)) {
      return mode === "markdown" ? formatPlanMarkdown(output) : formatPlanBrief(output);
    }
    return mode === "markdown" ? "# OH MY PM Plan\n\nOK\n" : "OH MY PM plan: ok\n";
  }

  if (mode === "markdown") {
    return "# OH MY PM Response\n\nOK\n";
  }
  return "OH MY PM response: ok\n";
}

export function formatCliError(code: string, message: string, mode: CliOutputMode): string {
  if (mode === "json") {
    return `${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return errorMarkdown(code, message);
  }
  return `error ${code}: ${message}\n`;
}
