// Deterministic formatting for provider status and doctor reports. Pure: no
// filesystem, environment, network, or clock access. Brief, JSON, and Markdown
// modes each emit exactly one trailing newline, a deterministic check order, no
// ANSI, no absolute paths, no token values, no raw errors, and no response
// bodies. Markdown escapes user-controlled repository values.

import type { CliOutputMode } from "@oh-my-pm/contracts";
import type {
  ProviderDoctorReport,
  ProviderStatusReport,
} from "./provider-diagnostics.js";

// All user-controlled values are rendered inside inline code spans, where the
// only character that can break out is a backtick. Replacing backticks with a
// visible sentinel keeps the value on one line and prevents span escape without
// littering the output with backslashes.
function escapeMarkdown(value: string): string {
  return value.replace(/`/g, "'");
}

// --- Provider status -------------------------------------------------------

function statusBrief(report: ProviderStatusReport): string {
  const github = report.providers.find((p) => p.id === "github");
  const overall = report.config.valid ? "ready" : "invalid";
  const lines: string[] = [`OH MY PM providers: ${overall}`, `config: ${report.config.displayPath}`];
  for (const provider of report.providers) {
    if (provider.id === "local") {
      lines.push(`local: ${provider.state} (offline, read-only)`);
    } else {
      lines.push(
        `github: ${provider.state} (explicit opt-in network, read-only)`,
      );
    }
  }
  if (github !== undefined) {
    lines.push(`github token: ${github.token}`);
  }
  lines.push("");
  return lines.join("\n");
}

function statusMarkdown(report: ProviderStatusReport): string {
  const lines: string[] = [
    "# OH MY PM Provider Status",
    "",
    `- Configuration: \`${escapeMarkdown(report.config.displayPath)}\``,
    `- Configuration file: ${report.config.exists ? "present" : "absent"}`,
  ];
  for (const provider of report.providers) {
    lines.push("", `## ${provider.id}`, "");
    lines.push(`- State: \`${provider.state}\``);
    lines.push(`- Read-only: yes`);
    lines.push(`- Network: ${provider.network === "none" ? "none" : "explicit opt-in"}`);
    if (provider.id === "github") {
      lines.push(`- Token: ${provider.token}`);
      if (provider.defaultRepository !== undefined) {
        lines.push(`- Default repository: \`${escapeMarkdown(provider.defaultRepository)}\``);
      }
      if (provider.defaultLimit !== undefined) {
        lines.push(`- Default limit: ${provider.defaultLimit}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatProviderStatusReport(
  report: ProviderStatusReport,
  mode: CliOutputMode,
): string {
  if (mode === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return statusMarkdown(report);
  }
  return statusBrief(report);
}

// --- Provider doctor -------------------------------------------------------

function doctorBrief(report: ProviderDoctorReport): string {
  const lines: string[] = [
    `OH MY PM provider doctor: ${report.ok ? "ok" : "attention"}`,
    `network attempted: ${report.networkAttempted ? "yes" : "no"}`,
  ];
  for (const check of report.checks) {
    lines.push(`- [${check.status}] ${check.id} — ${check.message}`);
  }
  if (report.github?.access !== undefined && report.github.access !== "not-checked") {
    lines.push(`- github access: ${report.github.access}`);
  }
  lines.push("");
  return lines.join("\n");
}

function doctorMarkdown(report: ProviderDoctorReport): string {
  const lines: string[] = [
    "# OH MY PM Provider Doctor",
    "",
    `- Result: \`${report.ok ? "ok" : "attention"}\``,
    `- Network attempted: ${report.networkAttempted ? "yes" : "no"}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of report.checks) {
    lines.push(`- **${check.status}** \`${check.id}\` — ${escapeMarkdown(check.message)}`);
  }
  if (report.github !== undefined) {
    lines.push("", "## GitHub", "");
    if (report.github.repository !== undefined) {
      lines.push(`- Repository: \`${escapeMarkdown(report.github.repository)}\``);
    }
    if (report.github.limit !== undefined) {
      lines.push(`- Limit: ${report.github.limit}`);
    }
    lines.push(`- Authentication: ${report.github.authentication}`);
    if (report.github.access !== undefined) {
      lines.push(`- Access: ${report.github.access}`);
    }
    if (report.github.providerCode !== undefined) {
      lines.push(`- Provider code: \`${escapeMarkdown(report.github.providerCode)}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatProviderDoctorReport(
  report: ProviderDoctorReport,
  mode: CliOutputMode,
): string {
  if (mode === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return doctorMarkdown(report);
  }
  return doctorBrief(report);
}
