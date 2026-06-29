# Golden Output: Software Backlog Prioritization

This is the reference output for the `software-prioritization` test scenario.

Use this to calibrate quality — not as an exact match requirement. The agent's output should have the same structure, language policy, and content depth.

---

## Backlog prioritization: In-app notification center v1

**Framework:** MoSCoW

Goal: Reduce support tickets from users missing account notifications.
Timeline: 5 weeks, team of 3.

---

### Must have

| Item | Rationale |
| --- | --- |
| Notification inbox UI | Core user-facing surface for the goal |
| Push notification infrastructure | Required to deliver notifications at all |
| Read/unread state | Users cannot act on notifications without this |

### Should have

| Item | Rationale |
| --- | --- |
| Deep link support | Improves action rate from notifications; deferrable if backend not ready |
| Notification preferences | Users who cannot control notifications will disable them |

### Could have

| Item | Rationale |
| --- | --- |
| Email digest option | Low-cost add-on if push infrastructure is in place |
| Notification grouping | Reduces noise; useful but not blocking |

### Won't have (v1)

| Item | Rationale |
| --- | --- |
| Admin panel | Internal tooling — no impact on user support ticket reduction |
| Analytics dashboard | Valuable but separate workstream; deferred to v2 |
| Multi-language content | Out of scope until core experience is stable |

---

## Missing PRD elements

| Missing element | Why it matters |
| --- | --- |
| Acceptance criteria | Without them, QA cannot define done |
| Success metric target | "Reduce support tickets" is directional — by how much? By when? |
| Non-goals | Without non-goals, any related feature could be argued as in scope |

**Recommended action:** Define acceptance criteria and success metric target before sprint planning. Add non-goals to block scope creep.

---

## Ordering note

Push notification infrastructure must be complete before inbox UI can be tested end-to-end. Plan the sprint order accordingly.
