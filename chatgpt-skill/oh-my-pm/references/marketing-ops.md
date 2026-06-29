# Reference: Marketing Operations

## Purpose

Guide the agent to manage marketing campaign delivery, GTM execution, creative/content handoffs, launch readiness, and operational risk in marketing contexts.

## When to use this reference

- User asks to review a marketing campaign plan or launch readiness
- User shares a GTM plan and asks for delivery assessment
- User asks about asset status, channel readiness, or approval flow
- User asks for a marketing status report or risk review

## Core operating principles

- A launch is a cross-functional delivery event. Treat it like a software release.
- Creative bottlenecks are the most common marketing blocker. Surface them early.
- Channel readiness and asset readiness must both be confirmed before launch.
- Measurement readiness is part of launch readiness. If you cannot measure, you cannot optimize.
- Approval cycles take longer than expected. Build them into the timeline, not after it.

## GTM readiness checklist

Before a campaign launch:

- [ ] Target audience defined and segmented
- [ ] Core message approved by PM and marketing leadership
- [ ] Creative assets (copy, design, video) completed and reviewed
- [ ] App store or platform listings (if applicable) submitted with review time factored in
- [ ] Email sequences or push campaigns set up and tested
- [ ] Paid media creative approved and uploaded
- [ ] Social media calendar scheduled
- [ ] Press outreach list finalized (if applicable)
- [ ] Tracking and analytics configured (UTM parameters, conversion events)
- [ ] Success metrics defined with baselines
- [ ] Post-launch review date set

## Campaign status output structure

```txt
Campaign: [Name]
Status: 🔴 Red / 🟡 Amber / 🟢 Green
Launch target: [Date]
Owner: [DRI]

Summary: [2-3 sentences — lead with key message]

Asset status:
| Asset | Owner | Status | Due |

Key risks:
| Risk | Likelihood | Impact | Mitigation |

Open decisions:
| Decision | Owner | Due |

Next actions:
| Action | Owner | By |
```

## Creative and content handoff

When reviewing creative/content handoff quality:

- Is the brief complete? (audience, message, format, tone, deadline)
- Are creative assets approved by the right stakeholder (PM, legal, brand)?
- Are final assets in the correct format and dimensions for each channel?
- Is copy within platform character limits?
- Are legal disclaimers or compliance requirements met?

A missing brief is a blocker. Do not let production start without one.

## Approval flow

Marketing approvals typically involve:

| Approval step | Owner | Typical lag |
| --- | --- | --- |
| Messaging / positioning | PM + marketing lead | 1-2 days |
| Creative | Design lead + brand | 1-2 days |
| Legal / compliance (if needed) | Legal | 3-5 days |
| Platform submission (App Store, etc.) | PMM | 1-3 days (review by platform) |

Build platform review time into the plan before the launch date, not after.

## Vendor and agency coordination

When external vendors or agencies are involved:

- Confirm deliverable specs and deadlines in writing before work starts.
- Build in a review cycle — at least one round of feedback.
- Do not assume vendor timelines are accurate. Add 20-30% buffer for first-time partners.
- Name a single point of contact on each side.

## Marketing calendar and dependencies

Marketing timelines depend on:

- Product milestone dates (feature freeze, launch date)
- Vendor or agency deliverable dates
- Platform submission windows (App Store, Google Play average 1-3 days)
- Press embargo dates
- Paid media activation dates (assets must be approved before campaign goes live)

Dependencies on product delivery are the highest-risk type. Confirm them with the PM before finalizing the marketing calendar.

## Measurement readiness

Before launch:

- [ ] KPIs defined (installs, signups, revenue, engagement rate — be specific)
- [ ] Baseline established (what is the current number?)
- [ ] Tracking implemented and tested (UTM parameters, analytics events firing)
- [ ] Dashboard or report set up
- [ ] Post-launch review date scheduled

If you cannot measure it, you cannot optimize it. Treat measurement as a launch blocker.

## Operational risks in marketing

| Risk | Likelihood signal | Mitigation |
| --- | --- | --- |
| Designer bottleneck | Multiple campaigns in parallel | Prioritize launch-critical assets; add freelance support |
| Platform rejection | Compliance-sensitive content | Pre-check guidelines; build review time in |
| Product delay pushes launch | Engineering dependencies | Contingency launch date or partial launch plan |
| Press embargo break | External agency or early access | Brief embargo terms explicitly in writing |
| Tracking not implemented | Engineering dependency | Confirm tracking setup is in sprint before launch |

## Post-launch review

Schedule a post-launch review 7-14 days after launch:

- Did we hit the KPIs?
- What drove performance — positive or negative?
- What would we change in the next campaign?
- Are there follow-up actions (budget reallocation, creative iteration)?

## Common mistakes to avoid

- Starting production before the messaging brief is approved
- Not building platform review time into the campaign timeline
- Assuming product screenshots will be available before feature freeze
- Treating measurement as a nice-to-have instead of a launch criterion
- Launching without a post-launch review date set

## Bilingual note

In Persian: لانچ (launch), کمپین (campaign), رودمپ (roadmap). Preserve English for all tool names (Figma, Google Ads, Mailchimp, UTM), metrics (KPI, OKR, CTR), and platform names (App Store, Google Play).
