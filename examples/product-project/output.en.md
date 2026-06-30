# Example: Product Project — Output (English)

This is a synthetic example of Oh My PM Head of Delivery output.

---

## PRD review: In-app notification center

**Status:** 🟡 Amber — PRD has blocking gaps before sprint planning can begin.

---

## PRD gap assessment

| Gap | Severity | Required action |
| --- | --- | --- |
| No acceptance criteria | Blocking | QA cannot plan work. Define for each Must have item before sprint. |
| Success metric is vague ("reduce support tickets") | Blocking | Specify target (e.g., "reduce notification-related tickets by 30% within 60 days"). Confirm baseline with support team. |
| Non-goals not listed | High | Without explicit non-goals, v2 items may be pulled into v1. Define and agree before sprint. |
| 5 items without sizing estimates | High | Cannot validate if Must have list fits in 5-week timeline. |
| No dependency mapping | Medium | Push notification infrastructure (M2) may depend on backend platform work — confirm before sprint. |

---

## Backlog prioritization (MoSCoW)

Goal: Reduce support tickets from users who miss important account notifications.

### Must have — v1 solves the core problem

| # | Item | Rationale |
| --- | --- | --- |
| 1 | Push notification infrastructure | Nothing works without delivery mechanism |
| 2 | Notification inbox UI | Core user experience |
| 3 | Read/unread state tracking | Minimum viable inbox — needed to know what was missed |
| 4 | Deep link support | Users must be able to act on notifications from the notification itself |

### Should have — include if capacity allows

| # | Item | Rationale |
| --- | --- | --- |
| 5 | Notification preference settings | Reduces future "too many notifications" support tickets |
| 6 | Email digest option | Reaches users who disable push — supports the goal |

### Could have — v2

| # | Item | Rationale |
| --- | --- | --- |
| 7 | Notification grouping by type | UX improvement, not required for goal |
| 8 | Admin panel for notification templates | Internal tooling — can be manual for v1 |

### Won't have — v1 explicit non-goals

| # | Item | Reason |
| --- | --- | --- |
| 9 | Analytics dashboard | Build the feature first. Instrument and measure in v2. |
| 10 | Multi-language notification content | Future phase. Confirm scope for v2 planning. |

---

## Critical path

1. PM defines acceptance criteria and success metric — Before sprint planning
2. Push notification infrastructure built and tested — Week 1-2
3. Notification inbox UI built — Week 2-3 (depends on infrastructure)
4. Read/unread + deep link support — Week 3-4
5. QA of all Must have items — Week 4-5
6. Go/no-go decision — End of Week 5

---

## Key decisions needed

- [ ] What is the measurable success target? Suggestion: "Reduce notification-related support tickets by 30% within 60 days of launch." Confirm current baseline with support team before sprint.
- [ ] Which notification types are in scope for v1? (Account, transactional, marketing, or all?)
- [ ] Who owns notification template management if the admin panel is deferred?

---

## Recommended next action

PM to define acceptance criteria for items M1-M4 and confirm success metric baseline before sprint planning starts. Sprint planning should not begin without these.
