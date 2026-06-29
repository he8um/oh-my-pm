# Test Scenario: Mixed FA/EN Repository Review

**Purpose:** Verify that Oh My PM handles a mixed Persian/English project context correctly — preserving English technical identifiers while using Persian for management communication.

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

- [ ] Persian used for management language
- [ ] English technical terms preserved exactly: API, frontend, backend, rollback plan, design, onboarding, kickoff
- [ ] No literal translation of technical terms (e.g. "وابستگی پیشین" for API — wrong)
- [ ] RAG status present
- [ ] Risks structured in table with likelihood, impact, mitigation
- [ ] Critical path present
- [ ] Actions have owner and deadline
- [ ] No padding

## Related example

`examples/mixed-delivery-project/output.fa.md`

## Related golden output

`tests/golden/mixed-delivery.output.md`
