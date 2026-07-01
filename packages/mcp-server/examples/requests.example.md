# MCP Tool Request Examples

These examples show how an MCP client invokes Oh My PM tools.

---

## inspect_project_context

No input required.

```json
{}
```

Example response:

```json
{
  "status": "ok",
  "data_source": "local_repo",
  "read_at": "2026-07-01T00:00:00.000Z",
  "project": {
    "name": "Payments API v2",
    "version": "v0.7.0",
    "has_agents_md": true,
    "project_root": "/projects/payments-api"
  }
}
```

---

## diagnose_project

Optional `focus` parameter.

```json
{ "focus": "launch readiness" }
```

---

## prepare_agent_handoff

Optional `context` parameter.

```json
{ "context": "Sprint 4 review complete. QA blocked on sandbox credentials." }
```

---

## summarize_delivery_status

No input required.

```json
{}
```

---

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `OH_MY_PM_PROJECT_ROOT` | Absolute path to the project root | `process.cwd()` |
| `OH_MY_PM_LOG_LEVEL` | Log level: debug, info, warn, error | `warn` |
