# Reference: Bilingual Persian/English

## Language policy

- Match the user's language by default.
- Use Persian for management, delivery, stakeholder, risk, and decision contexts.
- Preserve English for code, CLI, APIs, schemas, package names, filenames, config keys, and technical identifiers.
- Do not force literal Persian translations. Use natural, professional Persian.
- For bilingual outputs, separate FA and EN sections clearly.

## When to answer in Persian

Answer in Persian when:

- The user writes in Persian.
- The user explicitly requests Persian output.
- The context is a management or stakeholder communication (status report, decision log, risk register, retrospective).

Even in Persian responses, preserve English for technical identifiers (see below).

## When to preserve English

Always keep English for:

- Code, CLI commands, flags, and arguments
- API names, endpoints, and contracts
- Package names, filenames, config keys, environment variables
- Tool names: GitHub, Jira, Linear, Slack, Figma, etc.
- Technical roles in code context: frontend, backend, DevOps
- Delivery terms that are widely used as transliterations in Persian PM/tech teams: rollback, backlog, sprint, release, launch, kickoff

## How to handle mixed Persian/English input

When the user writes a mix of Persian and English:

- Respond in the language of the management layer (usually Persian for decisions, risks, plans).
- Preserve all English technical identifiers exactly as written.
- Do not translate technical identifiers even if a Persian equivalent exists.

Example — input:

```txt
قرارداد API بین frontend و backend نهایی نشده. rollback plan هم نداریم.
```

Example — correct output:

```txt
دو ریسک باز وجود دارد: قرارداد API نهایی نشده و rollback plan تعریف نشده.
```

Example — incorrect output (too literal):

```txt
دو خطر باز وجود دارد: رابط برنامه‌نویسی بین بخش جلو و عقب سیستم نهایی نشده...
```

## How to avoid bad literal translation

Do not translate:

| Avoid | Use instead |
| --- | --- |
| انتشار | ریلیز (in delivery context) |
| بازگردانی | رول‌بک |
| فهرست معوقه | بک‌لاگ |
| دوی سرعت | اسپرینت |
| وابستگی پیشین | API (never translate API) |

Use the terms from `glossary/fa-en.md` as the reference.

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
| kickoff | کیک‌اف |
| sign-off | تأیید |
| blocker | بلاکر |
| owner | مالک |
| critical path | مسیر بحرانی |
| PRD | PRD |
| MVP | MVP |
| KPI | KPI |
| OKR | OKR |
| GTM | GTM |
| PMM | PMM |
| QA | QA |
| API | API |
| SLA | SLA |
| RBAC | RBAC |
| DRI | DRI |
| RACI | RACI |

## How to structure bilingual outputs

When the user requests explicitly bilingual output, separate sections:

```txt
---
## فارسی

[Persian content here]

---
## English

[English content here]
```

Within a Persian section, technical identifiers remain in English inline — do not create a separate English column just for identifiers.

## Persian output quality checklist

Before finalizing Persian output:

- Does it sound like a capable PM wrote it in Persian?
- Are English technical identifiers preserved exactly?
- Are terms consistent with `glossary/fa-en.md`?
- Is the structure clear and actionable?
- Is it free of machine-literal phrasing?
- Is it concise — no padding, no filler?
