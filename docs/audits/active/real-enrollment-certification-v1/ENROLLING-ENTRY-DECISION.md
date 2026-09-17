# A child cannot enter Enrolling — and the fix is a decision, not a bug report

**Status: waiting on a Director decision.** This document decides nothing and changes nothing. It
exists because the decision currently lives only inside three run summaries, and an objective that
keeps being resumed with no way to progress is worse than one that is plainly parked.

## Why this is in front of you

The Admissions canonical-coverage objective is complete except for one leg: certifying a *fresh*
Enrollment end to end — `Decision → Begin Enrolling → Send enrollment paperwork → real email →
participant link`. Every route into Enrolling is blocked. Repairing any of them touches a surface
that objective freezes by name (Decision, the child Process surface, revision 35), so no lane should
act on it without you.

Nothing already certified depends on this. Parts D and E both start from a child who is **already**
Enrolling and are unaffected.

## What was measured

All four were driven through the real UI or the real API. None is inferred.

| Route | Result |
|---|---|
| Family-case stage move (*Move to Tour*, *Move to Waitlist* at case grain) | `PATCH /api/admin/opportunities/<id>` → **400** `status_key is not defined for this entity in status_definitions` |
| *Move to Enrolling* on a child record | `/api/admin/opportunities/<customer_member_id>/stage-transition-reconciliation/preflight` → **404** |
| `enroll_child` command | `registered: false`, blocker `unregistered_action` |
| `waitlist_child` command | **commits normally** — moved a child Lead → Waitlist |

That last row is what makes this precise rather than "lifecycle is broken". The per-child decision
machinery is healthy. It is the **entry to Enrolling specifically** that has no working route.

## The root cause of the first row

This organization's `opportunity` status vocabulary contains exactly four keys:

```
open · closed · inactive · archived
```

Every one carries `metadata.seed_source = "enrollment_alignment_status_collapse_v1"` and
`excluded_from_enrollment_stage_picker = true`. The vocabulary was **deliberately collapsed** so that
a case's stage lives on the process rather than on its status.

The stage-transition writer did not follow. It still asserts a per-stage `status_key` through
`assertAllowedStatusKey` (`web/lib/admin/statusDefinitionsResolve.ts:518`), and the reconciliation
preflight reports the move it intends as:

```
previous_status_key: "new"   →   next_status_key: "tour"
```

**Neither exists in the vocabulary.** The case's *currently stored* status is already outside the
list it is being validated against, so this is not a missing row — it is a writer and a vocabulary
that disagree about where stage lives.

One detail worth knowing before you look: the refusal renders *inside* the "Reconcile active work"
modal, which makes it read as a work-reconciliation problem. It is not.

## The decision

**Where is a case's stage allowed to live?**

### Option 1 — the collapse was right; the writer is stale

Stage lives on the process. The transition writer stops asserting a per-stage `status_key`, and the
four remaining statuses keep meaning what they now mean (open/closed/inactive/archived as *case
disposition*, not as *stage*).

- Consistent with `enrollment_alignment_status_collapse_v1` and with
  `excluded_from_enrollment_stage_picker`.
- Blast radius: every reader that still infers stage from `status_key`. The card header already
  shows the split — one family renders as `CASE · LEAD` in the chip while its body reads
  *"Waitlist · Manage waitlist candidates and spot offers."*
- Touches the stage-transition writer, which this objective freezes.

### Option 2 — the collapse was wrong; restore the per-stage keys

Re-seed `lead`, `tour`, `decision`, `waitlist`, `enrolling`, `enrolled` into the opportunity status
vocabulary so the writer's assertion succeeds.

- Smallest change to code; largest change to data doctrine.
- Reverses a deliberate migration, and `excluded_from_enrollment_stage_picker` suggests the
  collapse was considered rather than accidental.
- Leaves two facts unexplained: why the stored status is `new` (also not in either list), and what
  the four collapsed statuses are then *for*.

### Not an option

Forcing a disposition through some other command to fabricate an Enrolling child. A certification
that runs on a state no operator can produce certifies nothing, and Part E would then describe an
experience that does not exist. This was considered and declined.

## Two smaller defects waiting on the same decision

Both are independent of which option is chosen, and neither should be fixed piecemeal before it is.

1. **Wrong identifier.** The child record's *Move to Enrolling* passes a `customer_member` id to a
   route that takes an opportunity id. Whatever stage ends up meaning, that control is addressing
   the wrong record.
2. **Vocabulary without a handler.** `enroll_child` is declared in
   `lib/lifecycle/lifecycleStageBaseActions.ts` and in `workTemplateActionIntentCatalog.ts` at the
   `opportunity_customer_member` grain, and has no executor. Its sibling `waitlist_child` has one and
   works. If Option 1 is taken, this is probably the control that should replace the transition.
