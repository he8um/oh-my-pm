import { describe, expect, it } from "vitest";
import type {
  ProviderDoctorReport,
  ProviderStatusReport,
} from "../src/provider-diagnostics.js";
import {
  formatProviderDoctorReport,
  formatProviderStatusReport,
} from "../src/provider-format.js";

const statusReport: ProviderStatusReport = {
  schemaVersion: 1,
  config: { source: "defaults", exists: false, displayPath: "defaults", valid: true },
  providers: [
    { id: "local", enabled: true, readOnly: true, network: "none", state: "ready", token: "not-applicable" },
    {
      id: "github",
      enabled: true,
      readOnly: true,
      network: "explicit-opt-in",
      state: "needs-repository",
      defaultLimit: 50,
      token: "absent",
    },
  ],
};

const doctorReport: ProviderDoctorReport = {
  schemaVersion: 1,
  ok: true,
  networkAttempted: false,
  checks: [
    { id: "config.schema", status: "ok", message: "provider configuration is valid" },
    { id: "provider.github.origin", status: "ok", message: "fixed origin is https://api.github.com" },
    { id: "provider.github.token", status: "info", message: "token is absent; public repositories may still work" },
  ],
  github: { authentication: "unauthenticated", access: "not-checked" },
};

describe("formatProviderStatusReport", () => {
  it("brief matches the documented shape with one trailing newline", () => {
    const out = formatProviderStatusReport(statusReport, "brief");
    expect(out).toBe(
      [
        "OH MY PM providers: ready",
        "config: defaults",
        "local: ready (offline, read-only)",
        "github: needs-repository (explicit opt-in network, read-only)",
        "github token: absent",
        "",
      ].join("\n"),
    );
  });

  it("markdown has one trailing newline and no ANSI", () => {
    const out = formatProviderStatusReport(statusReport, "markdown");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\[/);
    expect(out).toContain("# OH MY PM Provider Status");
  });

  it("json emits the structured report with one trailing newline", () => {
    const out = formatProviderStatusReport(statusReport, "json");
    expect(out.endsWith("\n")).toBe(true);
    expect(JSON.parse(out)).toStrictEqual(statusReport);
  });

  it("escapes user-controlled repository values in markdown", () => {
    const withRepo: ProviderStatusReport = {
      ...statusReport,
      providers: [
        statusReport.providers[0]!,
        { ...statusReport.providers[1]!, state: "ready", defaultRepository: "a`b/c`d" },
      ],
    };
    const out = formatProviderStatusReport(withRepo, "markdown");
    expect(out).not.toContain("a`b/c`d");
  });
});

describe("formatProviderDoctorReport", () => {
  it("brief matches the documented shape", () => {
    const out = formatProviderDoctorReport(doctorReport, "brief");
    expect(out).toContain("OH MY PM provider doctor: ok");
    expect(out).toContain("network attempted: no");
    expect(out).toContain("- [ok] config.schema — provider configuration is valid");
    expect(out).toContain("- [info] provider.github.token — token is absent; public repositories may still work");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("markdown and json have one trailing newline", () => {
    const md = formatProviderDoctorReport(doctorReport, "markdown");
    const json = formatProviderDoctorReport(doctorReport, "json");
    expect(md.endsWith("\n") && !md.endsWith("\n\n")).toBe(true);
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json)).toStrictEqual(doctorReport);
  });

  it("is deterministic across repeated calls in every mode", () => {
    for (const mode of ["brief", "markdown", "json"] as const) {
      expect(formatProviderDoctorReport(doctorReport, mode)).toBe(
        formatProviderDoctorReport(doctorReport, mode),
      );
    }
  });

  it("never contains a token value", () => {
    const out = formatProviderDoctorReport(doctorReport, "json");
    expect(out).not.toContain("ghp_");
  });
});
