# Example: Mixed Delivery Project — Output (English)

This is a synthetic example illustrating bilingual delivery management — Persian business context, English technical identifiers.

---

## Project diagnosis: Customer onboarding redesign

**Status:** 🟡 Amber

Engineering is ready to start but is blocked on design sign-off. The API contract between frontend and backend is not finalized, creating a risk of parallel development divergence. Backlog exists but is unprioritized, which prevents a realistic timeline from being set.

---

## Critical path

1. Design sign-off received → Engineering kickoff — Before stakeholder review (this week)
2. API contract finalized (frontend ↔ backend) — Day 1 of engineering
3. Backlog prioritized (Must have items confirmed) — Before sprint 1
4. Sprint 1 complete — Week 2
5. Rollback criteria and plan defined — Week 2
6. Stakeholder review of progress — Week 3
7. Launch readiness assessment — TBD based on sprint velocity

---

## Top risks

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| API contract not finalized before engineering starts — frontend/backend drift | High | High | Define API contract as Day 1 deliverable. Block engineering start until contract is signed off. | Tech lead |
| Design sign-off delayed past stakeholder review date | Medium | High | Confirm design review timeline today. Escalate if not complete by end of week. | PM |
| No rollback plan — first release to production is unprotected | High | Medium | Define rollback criteria before any release to production. Rollback owner named. | Engineering lead |
| Backlog not prioritized — risk of building wrong thing first | High | Medium | Prioritize with team before sprint 1. Must have items must map to the goals. | PM |

---

## Immediate actions

| Action | Owner | By |
| --- | --- | --- |
| Confirm design review timeline and sign-off date | PM | Today |
| Finalize API contract (frontend ↔ backend) | Tech lead | Day 1 of engineering kickoff |
| Prioritize backlog — Must have items confirmed with team | PM | Before stakeholder review |
| Define rollback criteria for first production release | Engineering lead | Week 2 |

---

## Goal validation

Before sprint planning, confirm both goals are measurable with baselines:

| Goal | Current state | Target | Baseline confirmed? |
| --- | --- | --- | --- |
| کاهش drop-off در فرآیند onboarding | نرخ فعلی ۴۵٪ | زیر ۲۵٪ | نیاز به تأیید با analytics |
| Reduce time-to-activate | 8 minutes | Under 3 minutes | نیاز به تأیید با data |

---

## Key decisions needed

- [ ] Who approves the design sign-off? Is that the PM or the engineering lead?
- [ ] What is the definition of "onboarding complete" for the drop-off metric?
- [ ] If scope needs to be cut to meet the goals, which features are explicitly Won't have?
