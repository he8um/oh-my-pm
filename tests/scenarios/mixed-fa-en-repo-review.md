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

- Persian management communication
- English preserved: API, frontend, backend, rollback plan, design, backlog, onboarding
- Structured output with risks and actions
- No artificial literal translations

## Pass criteria

- [ ] Persian used for management language
- [ ] English technical terms preserved (API, frontend, backend, rollback plan)
- [ ] No literal translation of technical terms (e.g., "وابستگی پیشین" for API)
- [ ] Risks and actions structured

## Related example

`examples/mixed-delivery-project/output.fa.md`
