# MCP Security Policy

This document defines the security policy for the future Oh My PM MCP integration.

This is a planning document. No MCP implementation exists in v0.6.0.

---

## Summary

The Oh My PM MCP server is designed with a read-only-first, minimal-surface, no-telemetry security model. Write actions require explicit user confirmation and per-action review before they are enabled for any connector.

---

## Credentials

- **No credentials in the repository.** No API keys, tokens, passwords, or secrets are committed to source control.
- **No realistic credential examples.** Examples in documentation use clearly placeholder values only.
- **Environment variables only.** All connector credentials are provided at runtime via environment variables.
- **No credential logging.** Credentials must not appear in any log output, error message, or tool response.

### Expected environment variable pattern (future)

```txt
OH_MY_PM_GITHUB_TOKEN=<personal-access-token>
OH_MY_PM_CLICKUP_TOKEN=<api-token>
OH_MY_PM_LINEAR_TOKEN=<api-token>
```

These variables are read at MCP server startup. They are not passed as tool parameters. They are not stored by the server between restarts.

---

## Read-only default

- v0.7.0: All tools are read-only. No mutations are possible.
- Read-only means: no POST, PUT, PATCH, or DELETE calls to any external API.
- No tool may create, update, or delete data in any connected system in v0.7.0.

---

## Write action gating

Before any write action is added to any connector, the following conditions must all be met:

1. Written policy in this document for the specific action and connector
2. Explicit user confirmation required at the MCP tool call layer (not just at session start)
3. Per-connector safety review completed and documented
4. Rollback or undo path defined and documented
5. Action is scoped to the minimum necessary change
6. The action is listed in the connector allowlist for that version

---

## Connector allowlist

Only connectors explicitly configured and listed in the allowlist are accessible.

The MCP server does not attempt to connect to any system not in the user's configuration.

In v0.7.0, the allowlist contains no external connectors — local repo context only.

Connectors are added one per version starting at v0.8.0. Each connector is reviewed for security before release.

---

## No telemetry

- The MCP server collects no telemetry.
- No usage data, tool call counts, error rates, or user behavior is sent to any external service.
- No analytics events.
- No crash reporting to external services.

If local logging is added for debugging, it is:

- Opt-in
- Local-only
- Clearly documented

---

## No background network calls

- The MCP server makes no network calls unless a tool is explicitly invoked by the user or agent.
- No polling, no health checks to external services, no prefetching.
- Network activity is initiated only by tool calls.

---

## No broad repository scans

- The MCP server does not scan the entire repository by default.
- Agents must specify scope explicitly when requesting file inspection.
- The server does not read files outside the project root.
- Sensitive file patterns (`.env`, `*.key`, `*.pem`, `*secret*`) are excluded from any automatic scan.

---

## Least privilege

- Each connector's credentials are scoped to the minimum permissions needed.
- GitHub connector: read-only OAuth scope (`read:org`, `repo:read` only — no write scopes)
- Other connectors: equivalent read-only scope at configuration time
- The server does not request scopes it does not need

---

## Auditability

- Tool calls and their parameters should be loggable for user audit purposes
- Logging is opt-in and local-only
- Audit log format is human-readable
- No sensitive data (credentials, personal information beyond names and roles) in audit logs

Audit logging is a future consideration. It is not required for v0.7.0 alpha.

---

## Failure-safe behavior

- If a connector is unavailable, the agent continues without that data
- The server returns a structured error, not a crash
- The agent treats a tool error as a signal to proceed without the data, not to abort the session
- No partial write operations: if a write action is interrupted, the connector must leave the system in its prior state

---

## Private and internal data

- No private company data, internal project references, or personally identifiable information beyond what is minimally needed for delivery work
- No realistic-looking example credentials, issue IDs, or internal system references in documentation
- Documentation examples use clearly synthetic data

---

## Security reporting

See `SECURITY.md` for how to report security issues in Oh My PM, including MCP-related issues.

---

## Related docs

- `docs/mcp.md`
- `docs/mcp-interface-design.md`
- `docs/mcp-connector-roadmap.md`
- `docs/security-model.md`
- `SECURITY.md`
