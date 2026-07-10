import type { RuntimeResponse } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { formatCliError, formatRuntimeResponse } from "../src/index.js";

const statusResponse: RuntimeResponse = {
  id: "cli-status",
  ok: true,
  data: { version: "2.0.0-alpha.0", kernelVersion: "kernel-test", healthy: true },
  trace: [{ step: "runtime.status", status: "ok" }],
};

const doctorResponse: RuntimeResponse = {
  id: "cli-doctor",
  ok: true,
  data: {
    checks: [
      { id: "kernel.validation", status: "ok", message: "Kernel validation is available" },
    ],
  },
};

const failedResponse: RuntimeResponse = {
  id: "cli-status",
  ok: false,
  data: { code: "OMP-R-2001", message: "request failed kernel validation" },
  error: { code: "OMP-R-2001", message: "request failed kernel validation", blocking: true },
};

describe("cli formatting", () => {
  it("formats status in brief mode", () => {
    expect(formatRuntimeResponse(statusResponse, "brief")).toBe(
      "OH MY PM status: healthy\nversion: 2.0.0-alpha.0\nkernel: kernel-test\n",
    );
  });

  it("formats status in markdown mode without trace", () => {
    const output = formatRuntimeResponse(statusResponse, "markdown");
    expect(output).toBe(
      "# OH MY PM Status\n\n- Healthy: yes\n- Version: 2.0.0-alpha.0\n- Kernel: kernel-test\n",
    );
    expect(output).not.toContain("runtime.status");
  });

  it("formats status in json mode with the full response", () => {
    const output = formatRuntimeResponse(statusResponse, "json");
    expect(JSON.parse(output)).toEqual(statusResponse);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("formats doctor in brief mode", () => {
    expect(formatRuntimeResponse(doctorResponse, "brief")).toBe(
      "OH MY PM doctor: ok\nkernel.validation: ok - Kernel validation is available\n",
    );
  });

  it("formats doctor in markdown mode", () => {
    expect(formatRuntimeResponse(doctorResponse, "markdown")).toBe(
      [
        "# OH MY PM Doctor",
        "",
        "| Check | Status | Message |",
        "| --- | --- | --- |",
        "| kernel.validation | ok | Kernel validation is available |",
        "",
      ].join("\n"),
    );
  });

  it("formats a failed response in brief mode", () => {
    expect(formatRuntimeResponse(failedResponse, "brief")).toBe(
      "error OMP-R-2001: request failed kernel validation\n",
    );
  });

  it("formats a failed response in markdown mode", () => {
    expect(formatRuntimeResponse(failedResponse, "markdown")).toBe(
      "# OH MY PM Error\n\n- Code: OMP-R-2001\n- Message: request failed kernel validation\n",
    );
  });

  it("formats a cli parse error in json mode", () => {
    const output = formatCliError("OMP-C-3001", "missing command", "json");
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: { code: "OMP-C-3001", message: "missing command" },
    });
  });

  it("ends every output with exactly one newline", () => {
    const outputs = [
      formatRuntimeResponse(statusResponse, "brief"),
      formatRuntimeResponse(statusResponse, "markdown"),
      formatRuntimeResponse(statusResponse, "json"),
      formatRuntimeResponse(doctorResponse, "brief"),
      formatRuntimeResponse(doctorResponse, "markdown"),
      formatRuntimeResponse(failedResponse, "brief"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "brief"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "markdown"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "json"),
    ];
    for (const output of outputs) {
      expect(output.endsWith("\n")).toBe(true);
      expect(output.endsWith("\n\n")).toBe(false);
    }
  });
});
