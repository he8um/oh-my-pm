# Bilingual Support — Persian / English

Oh My PM supports Persian and English as first-class workflow languages.

## Language policy

- Agent output matches the user's language by default.
- Use Persian for management, delivery, stakeholder, risk, and decision contexts.
- Preserve English for code, CLI commands, APIs, schemas, package names, filenames, config keys, and technical identifiers.
- Do not force literal Persian translations. Use natural, professional Persian.
- For bilingual outputs, separate FA and EN sections clearly.

## Technical term conventions

| English | Persian usage |
| --- | --- |
| scope | اسکوپ |
| roadmap | رودمپ |
| backlog | بک‌لاگ |
| delivery | دلیوری |
| stakeholder | استیک‌هولدر |
| release | ریلیز |
| launch | لانچ |
| risk | ریسک |
| dependency | وابستگی |
| milestone | مایلستون |
| acceptance criteria | معیار پذیرش |
| PRD | PRD |
| MVP | MVP |
| KPI | KPI |
| OKR | OKR |
| GTM | GTM |

## Bilingual resources

- `glossary/fa-en.md` — Full Persian/English PM terminology glossary
- `templates/fa/` — Persian templates paired with `templates/en/`
- `prompts/fa/` — Persian prompts paired with `prompts/en/`
- `.cursor/rules/70-bilingual-fa-en.mdc` — Cursor bilingual rule

## Example: correct Persian PM output

```txt
ریسک اصلی این است که release بدون rollback plan انجام شود.
مایلستون بعدی تا پایان sprint سوم باید تکمیل شود.
```

## Example: bilingual section format

```txt
---
## فارسی

[Persian content here]

---
## English

[English content here]
```

## Related docs

- `glossary/fa-en.md`
- `docs/usage.md`
