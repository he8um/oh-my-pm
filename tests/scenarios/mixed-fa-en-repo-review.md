# Test Scenario: Mixed FA/EN Repository Review

**Purpose:** Verify that Oh My PM handles a mixed Persian/English project context correctly — using Persian for management language while preserving English technical identifiers exactly.

## Input

```txt
پروژه: طراحی مجدد onboarding مشتری
بک‌لاگ تعریف شده اما اولویت‌بندی نشده.
تیم مهندسی آماده شروع است — در انتظار تأیید design.
قرارداد API بین frontend و backend نهایی نشده.
هیچ rollback plan وجود ندارد.

وضعیت پروژه را تشخیص بده.
```

## Expected behavior

- Response in Persian (matches Persian input language)
- English preserved for all technical identifiers: API, frontend, backend, rollback plan, design, backlog, onboarding
- Structured output: RAG status, risks table, critical path, actions table
- No artificial literal translations of technical terms
- Risks tied to specific, actionable mitigations

## Pass criteria

- [ ] Response language is Persian
- [ ] RAG status present with one-line rationale in Persian
- [ ] Risk table structured with احتمال, تأثیر, اقدام کاهشی columns
- [ ] English technical terms preserved exactly: API, frontend, backend, rollback plan, design, onboarding, kickoff
- [ ] No literal translation of technical terms (e.g. "رابط برنامه‌نویسی" for API — wrong)
- [ ] Critical path present as numbered sequence in Persian
- [ ] Actions table has مالک and deadline
- [ ] No padding or filler

## Failure modes

- Translating API to "رابط برنامه‌نویسی"
- Translating frontend/backend to Persian equivalents
- Mixing Persian and English inconsistently (using English for some management terms)
- Missing critical path or risk table
- Response in English despite Persian input

## Related golden output

`tests/golden/mixed-delivery.output.md`

## Related example

`examples/mixed-delivery-project/output.fa.md`
