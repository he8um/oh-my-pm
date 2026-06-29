# Contributing to Oh My PM

Thank you for your interest in contributing to Oh My PM.

## Ways to contribute

- Report bugs using the bug report issue template
- Request features using the feature request issue template
- Report bilingual quality issues using the bilingual quality issue template
- Submit pull requests for fixes and improvements
- Improve documentation and examples

## Before contributing

- Read `docs/philosophy.md` to understand the product principles.
- Read `docs/architecture.md` to understand how files relate.
- Keep `AGENTS.md` as the source of truth. Tool-specific files are adapters.
- Do not add private company data, internal references, or secrets.
- Use synthetic examples only.

## Pull request guidelines

- Keep PRs focused on one change.
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`.
- Ensure `scripts/validate-agent-files.sh` passes.
- Ensure `scripts/validate-skill.sh` passes.
- Ensure `scripts/validate-bilingual.sh` passes.
- Do not commit generated zip files or `dist/` assets.

## Bilingual quality

If contributing Persian content:

- Follow `docs/bilingual-support.md`.
- Use natural, professional Persian — not literal machine translation.
- Preserve English technical identifiers.
- Pair every FA template or prompt with an EN counterpart.

## Code of conduct

See `CODE_OF_CONDUCT.md`.

## License

By contributing, you agree your contributions are licensed under MIT.
