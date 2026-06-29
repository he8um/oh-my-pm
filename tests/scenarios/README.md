# Scenario Index

This file lists all test scenarios in `tests/scenarios/`, their domain, language, and expected golden output.

Scenarios are used for manual evaluation. They are not automated integration tests.

---

## Scenarios

| File | Domain | Language | Purpose | Golden output |
| --- | --- | --- | --- | --- |
| `en-project-diagnosis.md` | Delivery | English | Structured project diagnosis with RAG, risks, critical path, actions | `tests/golden/en-project-diagnosis.output.md` |
| `fa-project-diagnosis.md` | Delivery | Persian | Persian project diagnosis; bilingual identifier handling | `tests/golden/fa-project-diagnosis.output.md` |
| `mixed-fa-en-repo-review.md` | Delivery | Mixed FA/EN | Mixed-input diagnosis; Persian management language + English identifiers | `tests/golden/mixed-delivery.output.md` |
| `software-prioritization.md` | Product/Software | English | MoSCoW backlog prioritization; missing PRD elements flagged | `tests/golden/software-prioritization.output.md` |
| `product-prd-review.md` | Product | English | PRD gap review: acceptance criteria, success metric, non-goals | `tests/golden/product-prd-review.output.md` |
| `marketing-launch-plan.md` | Marketing | English | Launch plan risk review; critical path and measurement gaps | `tests/golden/marketing-launch-plan.output.md` |
| `token-discipline.md` | Cross-cutting | English | Token efficiency: no filler, no restatement, concise output | `tests/golden/token-discipline.output.md` |

---

## Primary behavior under test

| Scenario | Primary behavior |
| --- | --- |
| `en-project-diagnosis.md` | Structured diagnosis: RAG status + risks table + critical path + actions |
| `fa-project-diagnosis.md` | Persian output; English technical identifier preservation |
| `mixed-fa-en-repo-review.md` | Mixed-input language handling; no literal translations |
| `software-prioritization.md` | MoSCoW framework; rationale per tier; missing PRD element detection |
| `product-prd-review.md` | PRD completeness check; blocking gap identification; concrete suggestions |
| `marketing-launch-plan.md` | GTM risk identification; critical path; measurement readiness |
| `token-discipline.md` | Anti-padding; anti-restatement; length discipline |

---

## How to use these scenarios

1. Provide the scenario input to the agent.
2. Compare output to the linked golden file for structure reference.
3. Score using `tests/evaluation-rubric.md`.
4. Check all pass/fail gates in the rubric.

Golden outputs define the quality bar, not exact wording. The agent may use different phrasing and still pass.
