# Test Scenario: Persian Project Diagnosis

**Purpose:** Verify that Oh My PM responds correctly in Persian when given a Persian project context, with structured output and correct bilingual handling.

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
- RAG status with one-line rationale in Persian
- Top risks in structured table: احتمال, تأثیر, اقدام کاهشی columns
- Critical path as numbered sequence in Persian
- Immediate actions table with مالک and ددلاین
- Technical terms preserved in English: API, sandbox, rollback plan, QA, vendor, DevOps
- No padding

## Pass criteria

- [ ] Response language is Persian
- [ ] RAG status present with one-line Persian rationale
- [ ] Risk table structured with احتمال, تأثیر, اقدام کاهشی columns
- [ ] Critical path present as numbered sequence
- [ ] Actions table has مالک and ددلاین columns
- [ ] Technical identifiers in English: API, sandbox, rollback plan, QA, vendor
- [ ] No padding or filler
- [ ] No literal translations: "اعتبارنامه sandbox" is correct; "ابزار کنترل دسترسی" for RBAC is not

## Failure modes

- Response in English despite Persian input
- Translating sandbox to "جعبه‌شن" or similar
- Translating QA to "تضمین کیفیت" in a technical context
- Missing critical path or actions table
- Vague actions without مالک

## Related golden output

`tests/golden/fa-project-diagnosis.output.md`

## Related example

`examples/software-project/output.fa.md`
