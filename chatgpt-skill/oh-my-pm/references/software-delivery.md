# Reference: Software Delivery

## Purpose

Guide the agent to manage software release readiness, technical delivery risk, QA coordination, rollback planning, and cross-functional go/no-go decisions.

## When to use this reference

- User asks about release readiness, go/no-go criteria, or launch risk
- User shares engineering context and asks for delivery assessment
- User asks about QA status, acceptance criteria, or CI/CD
- User asks for rollback planning or technical risk review

## Core operating principles

- Release readiness is a checklist, not a feeling. Define it before the sprint starts.
- Rollback must exist before go/no-go. A release without a rollback plan is a risk that has been accepted, not eliminated.
- QA is not the last phase. It is a constraint on the timeline. Plan it early.
- Acceptance criteria define "done." If they are missing, the feature is not ready to test.
- Technical debt is a risk. Name it, own it, and decide explicitly when to pay it.

## Release readiness checklist

Before approving go/no-go:

- [ ] All features in scope are implemented
- [ ] Acceptance criteria reviewed and confirmed
- [ ] QA complete: functional, regression, edge cases
- [ ] Performance requirements tested (if applicable)
- [ ] Security review done (if applicable: RBAC, authentication, data exposure)
- [ ] Rollback plan documented and tested
- [ ] Support and ops teams briefed
- [ ] Release notes or comms ready
- [ ] Monitoring and alerting in place
- [ ] Go/no-go decision recorded with owner

## Go/no-go decision format

```txt
Release: [Name / version]
Date: [Proposed date]
Decision: Go / No-go / Conditional go
Owner: [Who decides]
Criteria met: [Yes / Partially / No — with detail]
Conditions (if conditional): [What must be true before release]
Rollback plan: [Documented location or description]
```

## QA and test status

Track QA using:

| Test type | Status | Blocker | Owner |
| --- | --- | --- | --- |
| Functional | Pass / Fail / In progress | | |
| Regression | Pass / Fail / In progress | | |
| Performance | Pass / Fail / Skipped | | |
| Security | Pass / Fail / Skipped | | |
| UAT | Pass / Fail / Not started | | |

If UAT is not done: note it explicitly in go/no-go. Do not silently skip it.

## Acceptance criteria review

A feature is ready for testing when its acceptance criteria are:

- Specific: not "it works" but "user can submit form and receive confirmation email within 30 seconds"
- Testable: a QA engineer can verify without guessing
- Signed off: PM or product owner confirmed before QA starts

If acceptance criteria are missing or ambiguous, flag it before QA begins — not after.

## Rollback planning

A rollback plan must answer:

1. Who has authority to call a rollback?
2. What is the rollback procedure? (step-by-step, not vague)
3. How long does rollback take?
4. What is the data impact of rollback? (migrations, user state)
5. How do we verify rollback succeeded?

Document rollback in the release checklist, not a separate doc that might not be found.

## Technical debt assessment

When technical debt is relevant to a release decision:

| Debt item | Risk if deferred | Impact on release | Decision |
| --- | --- | --- | --- |
| [Description] | [Risk] | Blocking / Non-blocking | Accept / Fix now / Defer |

Do not hide technical debt in status updates. Name it and own the decision.

## CI/CD and pipeline status

When reviewing CI/CD as part of release readiness:

- Is the pipeline green on the release branch?
- Are all required checks passing (lint, tests, security scan)?
- Is there a staging or pre-production environment where the release was validated?
- Is deployment automated or manual? If manual, is the runbook current?

Preserve CI/CD tool names and commands exactly as given (GitHub Actions, `npm run test`, `docker build`, etc.).

## Cross-functional coordination

Software releases often need:

| Function | Contribution | Timing |
| --- | --- | --- |
| Engineering | Feature complete, tests passing, rollback ready | Before go/no-go |
| QA | Test complete, sign-off | Before go/no-go |
| Product | Acceptance criteria confirmed, PRD signed off | Before QA starts |
| Support | Briefed on new behavior, known issues | Before release |
| Comms/marketing | Release notes, user comms | Before or at release |
| Ops/SRE | Monitoring, alerting, runbook current | Before release |

Missing coordination is a release risk. Flag it explicitly.

## Engineering handoff checklist

When producing an engineering handoff (PM to engineering, or engineering to QA):

- [ ] Scope and non-goals documented
- [ ] Acceptance criteria written
- [ ] API contracts or schema changes documented
- [ ] Dependencies on other teams identified
- [ ] Known risks flagged
- [ ] Rollback approach discussed
- [ ] Definition of done agreed

## Common mistakes to avoid

- Treating QA as a formality after code is merged
- Approving go/no-go without a documented rollback plan
- Missing acceptance criteria discovered during QA
- Letting technical debt silently influence the timeline without naming it
- Giving a Go without cross-functional sign-off from support and ops

## Bilingual note

In Persian: معیار پذیرش (acceptance criteria), رول‌بک (rollback), ریلیز (release), مسیر بحرانی (critical path). Preserve English for all technical identifiers: CI/CD, GitHub Actions, pipeline, RBAC, API, staging, production.
