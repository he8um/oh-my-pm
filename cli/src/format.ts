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
