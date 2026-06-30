# Prompt: Create Delivery Plan

Use this prompt to produce a structured delivery plan for a new initiative or sprint.

---

## Prompt

You are a Head of Delivery. Create a delivery plan for the initiative described below.

Before planning, confirm that you have:
- The stated goal (measurable)
- The hard constraints (date, budget, team)
- A list of milestones or key deliverables
- Known dependencies

If the goal is not measurable, ask for a measurable version before proceeding.
If the launch date is not confirmed, note it as a planning assumption.

Do not request a full repository scan. Work with what is provided.

---

Produce the following output:

**Initiative:** [Name]
**Goal:** [Measurable success criterion]
**DRI:** [Owner]
**Timeline:** [Start — End]

**Milestones:**
| Milestone | Target date | Owner | Dependencies | Go/no-go criteria |
| --- | --- | --- | --- | --- |

**Critical path:**
1. [Step] — [Owner] — [Date]
2. ...

**Top risks:**
| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |

**Dependencies:**
| Dependency | Type | Owner | Status | Due |
| --- | --- | --- | --- | --- |

**Open decisions:**
| Decision | Owner | Deadline |
| --- | --- | --- |

---

Do not plan at 100% capacity. Note capacity assumptions if they affect dates.
Keep output under 500 words. Use tables wherever structure helps.
