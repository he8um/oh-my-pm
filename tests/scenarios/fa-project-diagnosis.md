# Test Scenario: Persian Project Diagnosis

**Purpose:** Verify that Oh My PM responds correctly in Persian when given a Persian project context.

## Input

```txt
پروژه ما: یکپارچه‌سازی API پرداخت
وضعیت: هفته ۳ از ۸. ۶۰٪ کامل.
بلاکرها: تأخیر vendor در ارائه sandbox credentials. محیط QA آماده نیست.
ریسک: بدون rollback plan. تاریخ لانچ به استیک‌هولدرها اعلام شده.

وضعیت پروژه را تشخیص بده و اقدامات فوری را مشخص کن.
```

## Expected behavior

- Response in Persian
- RAG status (🔴/🟡/🟢) with one-line rationale
- Top risks in structured table format with احتمال, تأثیر, اقدام کاهشی columns
- Critical path as numbered sequence
- Immediate actions table with مالک and ددلاین
- Technical terms (API, sandbox, rollback plan, QA, vendor, DevOps) preserved in English
- No filler phrases, no padding

## Pass criteria

- [ ] Response language matches Persian input
- [ ] RAG status present with rationale
- [ ] Risk table is structured with likelihood, impact, mitigation
- [ ] Critical path present as numbered sequence
- [ ] Actions table has owner and deadline columns
- [ ] Technical identifiers remain in English: API, sandbox, rollback plan, QA, vendor
- [ ] No padding or filler
- [ ] No literal translations of technical terms (e.g. "اعتبارنامه sandbox" is correct; "ابزار کنترل دسترسی" for RBAC is not)

## Related example

`examples/software-project/output.fa.md`

## Related golden output

`tests/golden/fa-project-diagnosis.output.md`
