# Test Scenario: Marketing Launch Plan Review

**Purpose:** Verify that Oh My PM reviews a marketing launch plan and identifies delivery risks, missing baselines, and immediate actions.

## Input

```txt
Campaign: Q3 mobile app v3.0 launch
Timeline: 6 weeks
Goal: 10,000 new installs in 30 days post-launch
Team: 2 PMM, 1 content, 1 designer (shared), 1 PM

Current state: Messaging approved. Assets 30% complete. Designer is shared with another campaign. Screenshots not available until feature freeze in 2 weeks.

Review this launch plan and identify risks.
```

## Expected behavior

- Designer bandwidth risk flagged as high
- Screenshot dependency on feature freeze flagged as a critical path item
- Asset completion rate assessed against timeline
- Missing baseline for success metric flagged
- Immediate actions with owners and timeframes
- No padding

## Pass criteria

- [ ] Designer bandwidth risk flagged with likelihood and impact
- [ ] Screenshot dependency flagged as critical path item
- [ ] Asset delivery milestone defined (e.g. all assets by week 5)
- [ ] Missing success metric baseline flagged
- [ ] Measurement readiness gap noted (tracking, UTM)
- [ ] Actions have owners and specific timeframes
- [ ] RAG status provided
- [ ] Response is structured

## Failure modes

- Accepting "10,000 installs" as a complete success metric without questioning baseline
- Not flagging designer bandwidth as a risk
- Not identifying screenshots as a critical path dependency
- Providing generic advice without tying to this specific plan

## Related golden output

`tests/golden/marketing-launch-plan.output.md`

## Related example

`examples/marketing-project/output.en.md`
