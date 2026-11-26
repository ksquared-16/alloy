# Workspace Critique

**Status:** Final design sprint review (July 2026)

---

## Does anything still feel like a CRM?

| Element | CRM risk | Verdict |
|---------|----------|---------|
| Status chip in fp-chrome | High | **Removed** — "Enrollment · North Campus" only |
| Update Status anywhere | High | **Removed** from workflow |
| Readiness as primary work list | Medium | **Demoted** — diagnostic row 3; Current Work owns blockers |
| Queue row showing stage name | Medium | **Changed** to work hint ("Needs first contact") |
| Flat action inventory | High | **Removed** — supporting actions inside Current Work Focus only |
| Field-empty blockers | Medium | **Replaced** with "You can't finish until…" copy |
| Manage ··· with workflow verbs | Medium | **Administrative only** in overflow |

**Remaining CRM adjacency:** Readiness card still shows factor checklist — acceptable as diagnostic if Current Work blockers use operator copy, not field keys.

---

## Does anything compete with Current Work?

| Element | Competes? | Resolution |
|---------|-----------|------------|
| Header primary CTA | Was yes | **None in header** |
| BOS rail | Could | BOS assists; Current Work leads |
| Readiness card | Could | Different job — full diagnostic vs mission blockers |
| Tour card actions | Could | Demoted to supporting actions in Focus |
| Activity mode | Could | Deep comms workspace — Current Work chip persists |
| Queue urgency styling | Low | Selection only — not workflow |

**No competing green buttons** on Summary canvas.

---

## Does anything distract from the operator's objective?

| Remove or reduce | Action |
|------------------|--------|
| Attention as separate row-1 card | **Removed** — merged into Current Work blockers |
| KPI strip on Focus Panel | **Not shown** — belongs on work unit, not record |
| Mission/objective label in header | **Removed** — card owns it |
| Upcoming pipeline preview | **Not included** — next work appears after completion |
| Duplicate action menus | **Single source** — Focus footer + header admin only |

---

## What can still be removed (P2 polish)

1. **Readiness card on Summary** — could move to Current Work Focus only for minimal canvas (tradeoff: loses at-a-glance diagnostic)
2. **Tour card when no tour stage** — hide via conditions (existing pattern)
3. **Mode tabs** — Summary could be default-only for V1; Work/Activity deferred (tradeoff: loses Activity cockpit path)

**Recommendation:** Ship full layout as mockup 01 — remove cards via conditions at runtime, not by removing slots from layout.

---

## What feels inevitable?

1. **Current Work first, full width** — opening a process record and seeing work immediately
2. **Click to Focus** — same as Household; zero new learning
3. **Completion inside Focus** — not a separate modal
4. **Summary refreshes silently** — no stage toast
5. **Checklist navigates** — cards are tools, not forms
6. **Queue hints as work** — not status badges

---

## Final verdict

The integrated workspace mockups represent **the Alloy Operator Workspace** — not a feature bolted onto a CRM.

An unfamiliar operator should understand within 5 seconds: **complete Qualify Family**.

Implementation requires:
- `current_work` Focus view + completion phases
- Published layout row 1 Fill
- Header status chip removal for process records
- Blocker copy projection
- No runtime changes

**Ready for implementation** with visual refinement only (spacing tokens, motion timing, avatar component).
