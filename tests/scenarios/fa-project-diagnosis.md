# Test Scenario: Persian Project Diagnosis

**Purpose:** Verify that Oh My PM responds correctly in Persian when given a Persian project context.

## Input

```
پروژه ما: یکپارچه‌سازی API پرداخت
وضعیت: هفته ۳ از ۸. ۶۰٪ کامل.
بلاکرها: تأخیر vendor در ارائه sandbox credentials. محیط QA آماده نیست.
ریسک: بدون rollback plan. تاریخ لانچ به استیک‌هولدرها اعلام شده.

وضعیت پروژه را تشخیص بده و اقدامات فوری را مشخص کن.
```

## Expected behavior

- Response in Persian
- RAG status with rationale
- Risks listed in structured format
- Actions with owners and timeframes
- Technical terms (API, sandbox, rollback plan, QA, vendor) preserved in English
- No filler phrases
- No padding

## Pass criteria

- [ ] Response language matches Persian input
- [ ] Risk list is structured
- [ ] Technical identifiers remain in English
- [ ] Actions are specific and owner-assigned
- [ ] No padding or filler

## Related example

`examples/software-project/output.fa.md`
