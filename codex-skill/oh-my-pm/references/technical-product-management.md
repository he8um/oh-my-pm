# Reference: Technical Product Management

## Purpose

Guide the agent to bridge product and engineering: reviewing technical feasibility, API/product boundaries, integration dependencies, technical acceptance criteria, and cross-functional delivery handoffs.

## When to use this reference

- User asks to review a technical PRD or engineering spec
- User asks about API contracts, schema changes, or integration dependencies
- User asks for technical feasibility assessment
- User asks about platform constraints, performance requirements, or security requirements
- User asks to coordinate PM and engineering handoff

## Core operating principles

- Technical feasibility must be confirmed before a feature enters a sprint.
- API contracts and schemas must be agreed before parallel frontend/backend work starts.
- Platform constraints and third-party limitations are delivery risks, not engineering details.
- Security and compliance requirements (RBAC, data residency, SLA) are acceptance criteria, not post-launch tasks.
- Cross-functional handoffs fail when assumptions are left implicit.

## Technical PRD review checklist

A technical PRD is ready for engineering when:

- [ ] Scope and non-goals are explicit
- [ ] API contracts documented (endpoints, request/response schema, error handling)
- [ ] Data model changes documented (schema, migrations, backward compatibility)
- [ ] Third-party integrations identified with SLA, rate limits, and failure modes
- [ ] Performance requirements specified (p95 latency, throughput, concurrency)
- [ ] Security requirements: RBAC, authentication, authorization, data exposure
- [ ] Availability requirements: SLA, fallback behavior, degradation handling
- [ ] Backward compatibility stated (breaking vs non-breaking change)
- [ ] Rollback plan feasibility confirmed (can this be rolled back? at what cost?)
- [ ] Acceptance criteria: technical pass criteria, not just functional behavior
- [ ] Dependencies: other teams, services, infrastructure, timeline

## API and product boundary

When frontend and backend work must proceed in parallel:

1. Define the API contract before either team starts.
2. Document: endpoint paths, HTTP methods, request body schema, response schema, error codes.
3. Agree on versioning strategy if the contract may change.
4. Mock the API for frontend if backend is not ready.
5. Review contract again before integration testing.

The API contract is a delivery dependency. Treat it like a milestone.

## Technical feasibility questions

Before committing to a feature:

- Can it be built in the available timeline with the current team?
- What infrastructure changes are required (database, caching, messaging)?
- Are there third-party dependencies with their own SLA or rate limits?
- Is there an existing pattern in the codebase, or does this require new architecture?
- What is the performance profile under expected load?
- What security or compliance requirements apply?

If any of these are unanswered, they are open decisions that must be resolved before planning is complete.

## Integration dependency tracking

| Integration | Owner | SLA | Rate limit | Failure mode | Status |
| --- | --- | --- | --- | --- | --- |
| [Service/API name] | [Team] | [Uptime target] | [Limit] | [Fallback or error behavior] | Confirmed / TBD |

External integrations are a common source of delivery delay. Identify them at planning, not during QA.

## Technical acceptance criteria

Technical acceptance criteria complement functional ones:

- Functional: "User can submit payment and receive confirmation."
- Technical: "Payment API p95 latency < 300ms under 500 concurrent requests. RBAC enforced on `/payments` endpoint. Rollback restores previous payment processor with zero data loss."

Both must be defined before QA starts.

## Platform constraints

Document any platform constraints that affect delivery:

| Constraint | Impact | Mitigation |
| --- | --- | --- |
| iOS App Store review (avg 1-3 days) | Delays mobile releases | Submit early; plan around review window |
| Third-party API rate limit | Throughput ceiling | Cache, queue, or negotiate higher limit |
| Database migration on live system | Downtime risk | Blue-green or zero-downtime migration strategy |
| Compliance requirement (GDPR, data residency) | Feature scope constraint | Confirm with legal before design |

## Cross-functional handoff checklist

When handing off from PM to engineering:

- [ ] Problem statement agreed
- [ ] Scope and non-goals documented
- [ ] API contracts defined
- [ ] Acceptance criteria written (functional and technical)
- [ ] Dependencies identified with owners
- [ ] Rollback approach discussed
- [ ] Performance and security requirements specified
- [ ] Definition of done agreed

When handing off from engineering to QA:

- [ ] Build deployed to staging or test environment
- [ ] Acceptance criteria shared with QA
- [ ] Known issues documented
- [ ] API documentation current
- [ ] Test data available

## Common mistakes to avoid

- Starting parallel development before the API contract is agreed
- Treating performance and security requirements as post-launch concerns
- Assuming platform review times are negligible
- Handing off to engineering without explicit acceptance criteria
- Discovering integration limitations during QA instead of at planning

## Bilingual note

In Persian: قرارداد API (API contract), معیار پذیرش (acceptance criteria), وابستگی (dependency), رول‌بک (rollback), اسکوپ (scope). Preserve English for all technical identifiers: API, RBAC, SLA, CI/CD, endpoint, schema, migration.
