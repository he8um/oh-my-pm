# Reference: Bilingual Persian/English

## Language policy

- Match the user's language by default.
- Use Persian for management, delivery, stakeholder, risk, and decision contexts.
- Preserve English for code, CLI, APIs, schemas, package names, filenames, config keys, and technical identifiers.
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
| PMM | PMM |
| QA | QA |
| API | API |
| SLA | SLA |

## Example: correct Persian output

```txt
ریسک اصلی این است که release بدون rollback plan انجام شود.
```

## Example: incorrect Persian output (too literal)

```txt
خطر اصلی این است که انتشار بدون برنامه بازگردانی انجام شود.
```

The second form is less natural for technical delivery work. Use transliterated technical terms where established.

## Bilingual section format

When producing explicitly bilingual output, separate sections:

```txt
---
## فارسی

[Persian content here]

---
## English

[English content here]
```
