# Golden Output: English Project Diagnosis

This is the reference output for the `en-project-diagnosis` test scenario.

Use this to calibrate quality — not as an exact match requirement. The agent's output should have the same structure, language policy, and content depth.

---

## Project diagnosis: Payments API v2

**Status:** 🟡 Amber

Integration is progressing but two blockers are compressing the QA window. Launch date is at risk without immediate escalation.

---

## Top 3 risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| QA window compressed if sandbox delayed further | High | High | Escalate to vendor executive contact today |
| No rollback plan at launch | High | High | Define rollback criteria by end of week 4 |
| QA environment blocked on DevOps | Medium | High | Engineering lead to escalate today with hard deadline |

---

## Critical path

1. DevOps unblocks QA environment (3 days)
2. Vendor delivers sandbox credentials (blocked, ~1 week estimated)
3. QA begins — cannot start until both above resolved
4. QA completes (minimum 2 weeks)
5. Rollback plan documented
6. Go/no-go
7. Launch

**Buffer: 0 days.**

---

## Immediate actions

| Action | Owner | By |
| --- | --- | --- |
| Escalate sandbox delay to vendor | PM | Today |
| Escalate DevOps blocker | Engineering lead | Today |
| Document rollback plan | Engineering lead | End of week 4 |
| Brief CTO on Amber status | PM | Tomorrow |
