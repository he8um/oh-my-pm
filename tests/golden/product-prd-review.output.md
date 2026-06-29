# Golden Output: PRD Review

This is the reference output for the `product-prd-review` test scenario.

Use this to calibrate quality — not as an exact match requirement. The agent's output should have the same structure, language policy, and content depth.

---

## PRD review: In-app notification center

**Status:** 🟡 Amber — three blocking gaps must be resolved before sprint planning.

---

## Blocking gaps

| Gap | Why it blocks delivery |
| --- | --- |
| No acceptance criteria | QA cannot define "done." Engineers cannot know when to stop. |
| No success metric target | "Reduce support tickets" without a target number or baseline is unmeasurable. You cannot declare success or failure. |
| No non-goals | Without them, any related notification feature is implicitly in scope. Scope creep risk is high with a 5-week timeline. |

---

## What to add

### Acceptance criteria (example)

```txt
- User can view all account notifications in the inbox
- Notifications are marked read when opened
- Push notification delivered within 30 seconds of trigger event
- Inbox loads in under 2 seconds on a 4G connection
```

### Success metric (example)

```txt
Support ticket volume related to missed account notifications decreases by 30% within 60 days of launch.
Baseline: current ticket volume (confirm with support team before sprint starts).
```

### Non-goals (example)

```txt
- Marketing or promotional notifications
- Admin-facing notification management panel
- Multi-language notification content
- Email digest (v2)
```

---

## Other observations

- **Team size (2 engineers, 1 designer, 5 weeks):** Tight but plausible if scope is narrow. Non-goals are critical to protect this.
- **Acceptance criteria must be written before QA planning begins** — not after development is complete.
