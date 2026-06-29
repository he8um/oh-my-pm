# Evaluation Rubric

Manual evaluation guide for Oh My PM outputs.

Use this rubric to assess whether an output meets the quality bar for a given scenario. This is not an automated check — it requires human judgment.

---

## How to use this rubric

1. Run the scenario input against the agent.
2. Score each dimension on a 1–5 scale.
3. Check all pass/fail gates.
4. Any gate failure is a blocking issue regardless of scores.

---

## Scoring dimensions

Score each dimension 1–5:

- **5** — Exceeds expectations. Structure is clear, content is specific and accurate, no issues.
- **4** — Meets expectations. Minor room for improvement, no blockers.
- **3** — Partially meets expectations. Some gaps but core quality is present.
- **2** — Below expectations. Structural or content issues that would mislead a PM.
- **1** — Failing. Output is not usable or actively incorrect.

### Dimension 1: Project understanding

Does the output demonstrate understanding of the specific project context provided?

- **5**: Output references specific details from the input; no generic advice
- **3**: Output is mostly relevant but includes some generic PM boilerplate
- **1**: Output ignores the specific context entirely

### Dimension 2: Scope clarity

Are goals, non-goals, and constraints clearly handled?

- **5**: Non-goals stated or flagged when absent; scope boundaries explicit
- **3**: Goals addressed but non-goals not mentioned despite being relevant
- **1**: Scope treated as unlimited; no constraint acknowledgment

### Dimension 3: Risk identification

Are the right risks surfaced with likelihood, impact, and mitigation?

- **5**: Top 3 risks are specific to the scenario; each has mitigation and owner
- **3**: Risks identified but mitigations are vague ("monitor closely")
- **1**: No risks, or only generic risks unrelated to the scenario

### Dimension 4: Prioritization quality

Is the prioritization tied to the stated goal with clear rationale?

- **5**: Framework applied correctly; each tier justified by the goal; ordering dependencies noted
- **3**: Framework applied but some items in wrong tier without explanation
- **1**: No framework; flat list with no rationale

### Dimension 5: Delivery realism

Does the plan account for real-world constraints (team size, timeline, dependencies)?

- **5**: Constraints explicitly factored in; critical path identified; no impossible plans
- **3**: Timeline referenced but dependencies or team constraints not assessed
- **1**: Plan ignores constraints; "do everything in parallel" with no grounding

### Dimension 6: Stakeholder usefulness

Would a real PM or stakeholder find this output actionable without further clarification?

- **5**: Actions are specific, owner-assigned, and time-bound
- **3**: Actions are directional but need a follow-up to be usable
- **1**: Output is descriptive but contains no actionable guidance

### Dimension 7: Bilingual quality (FA/EN scenarios only)

Is Persian natural and professional? Are technical identifiers preserved in English?

- **5**: Persian reads naturally; all technical identifiers in English; no literal translations
- **3**: Persian is understandable but some unnatural phrasing; one or two identifier errors
- **1**: Persian is a literal translation of English; multiple identifier translation errors

### Dimension 8: Technical identifier preservation (FA/EN scenarios)

Are code/API/tool/command identifiers preserved exactly?

- **5**: All identifiers preserved: API, rollback plan, QA, frontend, backend, CI/CD, PRD, backlog
- **3**: Most identifiers preserved; one or two translated
- **1**: Multiple technical identifiers translated to Persian

### Dimension 9: Token efficiency

Is the output concise without losing content quality?

- **5**: No filler, no restatement of input, ends when complete; under target length
- **3**: Minor padding; one or two filler phrases; slightly over target length
- **1**: Significant padding; restates input; adds trailing summary; well over target length

### Dimension 10: Actionability

Does the output result in at least one specific next action with a named owner and timeframe?

- **5**: Multiple specific actions with owners and deadlines
- **3**: Actions present but some lack owner or timeframe
- **1**: No specific actions; output is purely descriptive

---

## Pass/fail gates

Any gate failure makes the output non-passing regardless of dimension scores.

| Gate | Condition |
| --- | --- |
| No private data leakage | Output does not include internal company names, internal system names, credentials, or private URLs from training data |
| No hallucinated integrations | Output does not claim to access external systems (Jira, Linear, Slack, GitHub) that were not provided |
| No unsupported write actions | Output does not claim to have created, written, or modified files, issues, or tickets |
| No full-repo scan by default | Output does not claim to have read every file in a repository without being asked |
| No translation of technical identifiers | Output does not translate API, PRD, backlog, CI/CD, rollback, SLA, KPI, OKR, YAML, JSON, GitHub Actions into Persian |

---

## Minimum passing score

A scenario output passes when:

- All 5 pass/fail gates: pass
- Average dimension score: 3.5 or higher
- No individual dimension score: 1

---

## Scenario-specific guidance

### Project diagnosis scenarios

Focus dimensions: Project understanding (1), Risk identification (3), Delivery realism (5), Actionability (10).
Key check: RAG status present with one-line rationale; critical path identified.

### Prioritization scenarios

Focus dimensions: Scope clarity (2), Prioritization quality (4), Delivery realism (5).
Key check: Won't have items present with rationale; missing PRD elements flagged.

### PRD review scenarios

Focus dimensions: Scope clarity (2), Actionability (10), Stakeholder usefulness (6).
Key check: Blocking gaps named; concrete examples of what to add.

### Marketing launch scenarios

Focus dimensions: Risk identification (3), Delivery realism (5), Actionability (10).
Key check: Critical path dependencies identified; measurement readiness assessed.

### Bilingual scenarios (FA/EN)

Focus dimensions: Bilingual quality (7), Technical identifier preservation (8), Token efficiency (9).
Key check: No literal translations of API, rollback, QA, frontend, backend.

### Token discipline scenarios

Focus dimensions: Token efficiency (9), Actionability (10).
Key check: Under 250 words; no filler; no restatement; ends when complete.

---

## Notes for evaluators

- Evaluate against the golden output for structure reference, not for exact wording.
- A response can score 5 on all dimensions while using different phrasing than the golden output.
- A response that follows all rules but is verbose should score 2–3 on token efficiency.
- If a scenario has no golden output, evaluate against the scenario's pass criteria directly.
