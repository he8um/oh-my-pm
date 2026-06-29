# Golden Output: Persian Project Diagnosis

This is the reference output for the `fa-project-diagnosis` test scenario.

Use this to calibrate quality — not as an exact match requirement. The agent's output should have the same structure, language policy, and content depth.

---

## تشخیص پروژه: یکپارچه‌سازی API پرداخت

**وضعیت:** 🟡 زرد

یکپارچه‌سازی در پیشرفت است اما دو بلاکر پنجره QA را فشرده می‌کنند و ریسک تاریخ لانچ وجود دارد.

---

## ریسک‌های اصلی

| ریسک | احتمال | تأثیر | اقدام کاهشی |
| --- | --- | --- | --- |
| تأخیر sandbox credentials — پنجره QA فشرده می‌شود | بالا | بالا | اسکالیشن به مخاطب اجرایی vendor امروز |
| نبود rollback plan در لانچ | بالا | بالا | تعریف معیار و روش rollback تا پایان هفته ۴ |
| محیط QA بلاک روی DevOps | متوسط | بالا | لید مهندسی امروز با ددلاین مشخص اسکالیشن کند |

---

## اقدامات فوری

| اقدام | مالک | تا |
| --- | --- | --- |
| اسکالیشن به vendor | PM | امروز |
| اسکالیشن به DevOps | لید مهندسی | امروز |
| مستندسازی rollback plan | لید مهندسی | پایان هفته ۴ |
| اطلاع‌رسانی وضعیت زرد به CTO | PM | فردا |
