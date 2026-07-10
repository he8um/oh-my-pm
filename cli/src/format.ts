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
  const summary = stringFrom(output["summary"]);
  if (summary !== undefined) {
    return `OH MY PM plan: ok\n${summary}\n`;
  }
  const tasks = arrayFrom(output["tasks"]);
  if (tasks !== undefined) {
    return planBriefList("tasks", tasks.length, titlesFrom(tasks, "title").slice(0, 5));
  }
  const risks = arrayFrom(output["risks"]);
  if (risks !== undefined) {
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
  const summary = stringFrom(output["summary"]);
  if (summary !== undefined) {
    return `# OH MY PM Plan\n\n${summary}\n`;
  }
  const tasks = arrayFrom(output["tasks"]);
  if (tasks !== undefined) {
    return planMarkdownList("Tasks", titlesFrom(tasks, "title"));
  }
  const risks = arrayFrom(output["risks"]);
  if (risks !== undefined) {
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
