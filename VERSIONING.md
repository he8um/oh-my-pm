# Versioning

Oh My PM uses Semantic Versioning.

## Version format

```
vMAJOR.MINOR.PATCH[-PRERELEASE]
```

## Rules

| Increment | When |
|---|---|
| MAJOR | Breaking behavior or install contract changes |
| MINOR | Compatible new domains, playbooks, templates, packs, connectors, or MCP features |
| PATCH | Wording, docs, validation, packaging, and compatibility fixes |

## Pre-release labels

- `-alpha` — early preview; install contract may change
- `-beta` — feature-complete; may have known limitations
- No label — stable release

## Before v1.0.0

The install contract may change between minor versions before v1.0.0.

Always read the `CHANGELOG.md` and `compatibility.md` before upgrading.

## VERSION files

Every pack, skill, and installable component includes a `VERSION` file.

All VERSION files must equal the same version string for any given release.

## Related docs

- `CHANGELOG.md`
- `ROADMAP.md`
- `docs/upgrading.md`
- `docs/compatibility.md`
