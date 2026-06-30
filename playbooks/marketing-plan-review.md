# Playbook: Marketing Plan Review

## Purpose

Identify delivery risks, missing baselines, and critical path dependencies in a marketing or campaign plan before execution begins.

## When to use

- A campaign or launch plan is ready for review
- Marketing and product timelines are being aligned
- A campaign is in flight and showing warning signs
- GTM readiness needs to be assessed before launch

## Inputs needed

```txt
Campaign brief or plan
Timeline and milestone list
Asset production status
Team capacity and dependencies
Success metrics and measurement plan
Product milestone dates (if launch is tied to product)
```

## Fast-start questions

1. "What is the success metric — and what is the baseline?"
2. "What is the critical path? What is the latest date each dependency must be resolved?"
3. "Who is the designer — and what else are they working on?"
4. "What assets depend on the product being finalized? When is feature freeze?"
5. "Is measurement infrastructure in place before launch, or after?"

## Recommended process

1. **Check goal clarity** — Is the campaign goal specific and measurable? Is there a baseline?
2. **Assess audience definition** — Is the target audience specific or generic?
3. **Review channel selection** — Are channels selected based on where the audience is? Is the mix justified?
4. **Assess asset readiness** — What is the current status? What is the critical path to completion?
5. **Check dependency map** — What depends on product readiness, legal approval, or other teams?
6. **Identify bandwidth risks** — Shared designers and writers are the most common bottleneck.
7. **Review measurement plan** — UTM parameters, analytics events, and dashboards must be ready before launch.
8. **Assess approval flow** — Who approves what, and how long does it take?

## Critical path for marketing launches

Common marketing critical path:

```txt
Messaging approved
→ Creative brief written
→ Design started
→ Copy written
→ Design reviewed and approved
→ Legal review (if needed)
→ Assets finalized
→ App store / platform submission (1-3 day review window)
→ Paid media uploaded and reviewed
→ Campaign live
```

Any delay in an earlier step compresses all later steps.

## Common risks

| Risk | Likelihood signal | Mitigation |
| --- | --- | --- |
| Designer bandwidth | Shared with another campaign | Confirm allocation today; identify freelance backup |
| Product screenshot dependency | Feature freeze in 2+ weeks | Book screenshot session for day 1 of feature freeze |
| Platform review delay (App Store, Google Play) | Average 1-3 days | Submit early; do not schedule campaign live on review day |
| Tracking not implemented | Engineering dependency | Confirm tracking is in the engineering sprint before launch |
| Legal review delay | Compliance-sensitive content | Start legal review immediately; build review time into plan |
| Success metric has no baseline | New campaign or audience | Confirm baseline with analytics before launch |

## Measurement readiness checklist

- [ ] Success metric defined with target value and baseline
- [ ] UTM parameters for all campaign links set up
- [ ] Conversion events firing and verified in analytics
- [ ] Dashboard or report set up and accessible
- [ ] Post-launch review date scheduled

If tracking is not ready before launch, you cannot measure success. Treat it as a launch blocker.

## Quality checklist

- [ ] Campaign goal is measurable with a baseline
- [ ] Target audience is specific (not "everyone")
- [ ] Designer capacity confirmed for the full campaign timeline
- [ ] Screenshot or product asset dependencies mapped to product timeline
- [ ] Platform submission time factored into the calendar
- [ ] Measurement infrastructure confirmed before launch date
- [ ] Approval flow and timing documented
- [ ] Post-launch review scheduled

## Common mistakes

- Accepting "10,000 installs" as a success metric without a baseline
- Not confirming designer bandwidth until assets are already late
- Scheduling campaign live on the same day as platform submission
- Treating measurement as a nice-to-have
- Not building legal review time into the calendar
- Not scheduling a post-launch review

## Related templates

- `templates/en/project-brief.md`
- `templates/en/status-report.md`

## Related scenarios

- `tests/scenarios/marketing-launch-plan.md`
