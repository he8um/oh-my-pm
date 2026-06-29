# Golden Output: Mixed FA/EN Delivery

This is the reference output for the `mixed-fa-en-repo-review` test scenario.

Use this to calibrate quality — not as an exact match requirement. The agent's output should have the same structure, language policy, and content depth.

---

## تشخیص پروژه: طراحی مجدد onboarding

**وضعیت:** 🟡 زرد

مهندسی روی تأیید design بلاک است. نبود قرارداد API ریسک drift بین frontend/backend است.

---

## ریسک‌های اصلی

| ریسک | احتمال | تأثیر | اقدام کاهشی |
| --- | --- | --- | --- |
| قرارداد API نهایی نشده — drift بین frontend/backend | بالا | بالا | قبل از شروع مهندسی تعریف شود. tech lead مسئول شود. |
| تأخیر تأیید design | متوسط | بالا | تایم‌لاین تأیید design امروز تأیید شود. در صورت عدم تکمیل قبل از kickoff، اسکالیشن شود. |
| نبود rollback plan | بالا | متوسط | قبل از اولین ریلیز به production تعریف شود. |

---

## مسیر بحرانی

۱. تأیید design — بلاک فعلی
۲. نهایی کردن قرارداد API بین frontend و backend
۳. kickoff مهندسی
۴. توسعه و QA
۵. تعریف rollback plan
۶. تصمیم گو/نوگو
۷. ریلیز به production

---

## اقدامات فوری

| اقدام | مالک | تا |
| --- | --- | --- |
| تأیید تایم‌لاین design | PM | امروز |
| نهایی کردن قرارداد API | tech lead | قبل از kickoff مهندسی |
| اولویت‌بندی بک‌لاگ | PM | قبل از بررسی استیک‌هولدرها |
| تعریف معیارهای rollback | لید مهندسی | هفته ۲ |

---

## نکته: حفظ شناسه‌های فنی

در این خروجی موارد زیر عمداً انگلیسی باقی ماندند:

- API, frontend, backend, onboarding, design, rollback plan, production, kickoff, tech lead, QA

این مطابق سیاست زبانی Oh My PM است. این شناسه‌ها را ترجمه نکنید.
