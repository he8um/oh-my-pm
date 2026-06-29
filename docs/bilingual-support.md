# Bilingual Support — Persian / English

Oh My PM supports Persian and English as first-class workflow languages.

## Language policy

- Agent output matches the user's language by default.
- Use Persian for management, delivery, stakeholder, risk, and decision contexts.
- Preserve English for code, CLI commands, APIs, schemas, package names, filenames, config keys, and technical identifiers.
- Do not force literal Persian translations. Use natural, professional Persian.
- For bilingual outputs, separate FA and EN sections clearly.

## When the agent responds in Persian

The agent responds in Persian when:

- The user writes in Persian.
- The user explicitly requests Persian output.
- The context is management or stakeholder communication.

Even in Persian responses, all technical identifiers remain in English.

## When the agent preserves English

Always kept in English: code, CLI commands, API names, package names, filenames, config keys, environment variables, tool names, and delivery terms widely used as transliterations in Persian PM/tech teams (rollback, backlog, sprint, release, kickoff).

## Handling mixed Persian/English input

When the user writes mixed Persian and English, the agent:

- Responds in Persian for the management layer (decisions, risks, status, plans).
- Preserves all English technical identifiers exactly as given.
- Does not translate identifiers even if a Persian equivalent exists.

Example input:

```txt
پروژه ما با تأخیر در تیم backend مواجه شده. API contract نهایی نشده. rollback plan هم نداریم.
```

Correct output (Persian management, English identifiers preserved):

```txt
**وضعیت:** 🔴 قرمز

سه بلاکر اصلی وجود دارد: تأخیر در backend، API contract نهایی‌نشده، و نبود rollback plan.
اقدام فوری: تیم backend را تا امروز آنبلاک کن. API contract را قبل از شروع توسعه نهایی کن.
```

Incorrect output (too literal — avoid):

```txt
پروژه با تأخیر بخش پشتی مواجه است. قرارداد رابط برنامه‌نویسی نهایی نشده...
```

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
| rollback | رول‌بک |
| escalation | اسکالیشن |
| blocker | بلاکر |
| owner | مالک |
| critical path | مسیر بحرانی |
| PRD | PRD |
| MVP | MVP |
| KPI | KPI |
| OKR | OKR |
| GTM | GTM |

See `glossary/fa-en.md` for the full terminology reference.

## Bilingual section format

When producing explicitly bilingual output, separate FA and EN sections:

```txt
---
## فارسی

[Persian content here]

---
## English

[English content here]
```

## Example: correct Persian PM output

```txt
ریسک اصلی این است که release بدون rollback plan انجام شود.
مایلستون بعدی تا پایان sprint سوم باید تکمیل شود.
```

## Example: incorrect Persian PM output (too literal — avoid)

```txt
خطر اصلی این است که انتشار بدون برنامه بازگردانی انجام شود.
نقطه عطف بعدی تا پایان دوی سرعت سوم باید تکمیل شود.
```

## Bilingual resources

- `glossary/fa-en.md` — Full Persian/English PM terminology glossary
- `templates/fa/` — Persian templates paired with `templates/en/`
- `prompts/fa/` — Persian prompts paired with `prompts/en/`
- `examples/` — Bilingual example inputs and outputs
- `.cursor/rules/70-bilingual-fa-en.mdc` — Cursor bilingual rule
- `chatgpt-skill/oh-my-pm/references/bilingual-fa-en.md` — Skill-level bilingual reference

## Related docs

- `glossary/fa-en.md`
- `docs/usage.md`
- `docs/examples.md`
