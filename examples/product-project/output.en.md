# Example: Product Project — Output (English)

---

## PRD review: In-app notification center

**Missing from PRD:**
- Acceptance criteria not defined
- Success metric not specified (just "reduce support tickets" — needs a target number and measurement method)
- Non-goals not listed — what is explicitly out of scope for v1?

---

## Backlog prioritization (MoSCoW)

### Must have (v1 — solves the core problem)

1. **Push notification infrastructure** — nothing works without this
2. **Notification inbox UI** — the core user experience
3. **Read/unread state tracking** — minimum viable inbox
4. **Deep link support** — users must be able to act on notifications

### Should have (v1 if capacity allows)

5. **Notification preference settings** — reduces future support tickets
6. **Email digest option** — reaches users who disable push

### Could have (v2)

7. **Notification grouping by type** — nice UX, not critical for goal
8. **Admin panel for notification templates** — internal tooling, can wait

### Won't have (v1 — explicit non-goal)

9. **Analytics dashboard** — build the feature first, measure later
10. **Multi-language notification content** — future phase

---

## Key decisions needed

- [ ] What is the target reduction in support tickets? (needed for success metric)
- [ ] Which notification types are in scope for v1?
- [ ] Who owns the admin panel if deferred — product or ops?
