# Certification tenant repaired — validation is zero

**Run:** `erun_511bb26f36d9330d` · draft_revision **2 → 3** · **0 blocking errors** · Not published

## 1. Why this tenant looked broken

**It was not seeded from an older model, and the branching was never missing.** The tenant carries the
canonical `tracks_v1.split_rules` exactly as `enrollmentProcessTemplate` defines them —
`family_track → child_track` from `decision`, with `waitlist / enrolling / closed_withdrawn /
no_action` per-subject outcomes.

What it *also* carried was an older layer that predates that model: **direct family→child stage
transitions** doing by hand what the split rule already expresses. Both were present at once, and the
grain validator correctly refuses the older one.

So the classification is:

| Problem | Kind |
|---|---|
| 6 cross-grain errors | **Stale tenant data** — legacy direct transitions duplicating the split rule |
| 3 close-status errors | **Product defect** — unfixable by any configuration (see §3) |
| 11 command-selection errors | **Product defect + resulting stale data** — a migration stamped an empty set nobody authored |

The stages did not "suddenly" break. The packet-selection save was the tenant's **first save in eight
days**, and a save is what runs the stamping migration and re-runs whole-process validation. The
legacy cross-grain data had been sitting there unvalidated the whole time.

## 2. Cross-grain repair — stale data removed, capability preserved

Removed the direct family→child transitions and turned the outcome rules that used them into
`no_movement`, so the **outcome survives** (an operator still records "family enrolling") while the
**movement becomes per-child** through the split rule:

* `decision_to_enrolling`, `decision_to_waitlist` — removed; `family_enrolling_move` and
  `waitlist_move` → `no_movement`
* `tour_to_waitlist` — removed; `no_availability_waitlist` → `no_movement`

Tour could previously send a family to the waitlist and had **no split rule of its own**, so deleting
that path would have removed a legitimate capability. Instead a second split rule was authored from
`tour` into the child track (`waitlist`, `no_action`) — the capability preserved in the canonical
mechanism rather than deleted.

**Result:** `family→child direct transitions: NONE`. Grains untouched — 4 Family / 4 Child, 8 stages.
Split rules now: **decision, tour**.

The invariant holds: Child A → Enrolling while Child B → Waitlist, with the family record staying on
the family track.

## 3. Close as Lost — the data was wrong *and* the check was

Both were true, and only fixing both clears it.

* **Data:** the three transitions named `status_key: "closed"`, which does not exist. Repointed to
  **`lost`** — the configured terminal status, matching their label. No status created or renamed.
* **Defect:** repointing alone changed nothing. The check fired whenever its guard was skipped —
  *including when a status IS named but the caller cannot supply the catalog.* Publish validation
  never supplies it, deliberately, and documents why two hundred lines above the family-close branch
  that honours the rule. So **every closing transition in every tenant failed publication**, whatever
  status it named.

Now it fires only when the status is genuinely **absent** — decidable without a catalog, because
there is nothing to look up. With a catalog present the real check is unchanged, including an *empty*
catalog, which is a real answer rather than an absent one. That is not a weakened validator; it stops
reporting a check that was never performed.

## 4. Command selection

The stored `command_set_v1: { version: 1, commands: [] }` was **manufactured, not authored** — proven
by the pre-packet draft carrying `null`. Removed, restoring the true prior state.

Absence now means the same thing to both readers, and the selector agrees:

```
quick_message=true  schedule_tour=true  send_form=true
```

**Reported separately, not widened:** `send_form` and `send_enrollment_packet` declare
`supportedSubjects: ["opportunity"]` while `enrolling` is child-grain. If they remain unavailable
there, that is the registered subject rule working correctly.

## 5. Certified paperwork preserved

`enrolling` still carries exactly **5** requirements, in certified order, all
`form/required/record/stage_exit/blocking`. No Direct Payment Authorization, no packet id, **no other
stage** has requirements. Process description intact.

## 6. Entry intent

`entry_points_v1.by_intent.enrollment_start = "enrolling"`. No `create_lead`.

## 7. Validation

```
draft_revision 3 · 0 errors · 0 warnings
8 stages · 4 family · 4 child
family→child direct transitions: NONE
close transitions: lead / tour / decision → lost
```

## 8. Exact tenant diff

**Stale configuration repaired**
* −3 direct cross-grain transitions (`decision_to_enrolling`, `decision_to_waitlist`, `tour_to_waitlist`)
* 3 outcome-rule targets `move_to_stage` → `no_movement`
* 3 close transitions `status_key` `closed` → `lost`
* −1 manufactured empty `command_set_v1`

**New certification configuration**
* +1 split rule from `tour` (preserves Tour's waitlist capability canonically)
* +`entry_points_v1.by_intent.enrollment_start = enrolling`

**Deterministic normalization** — none beyond what the save already applied at revision 2.

**Code defects fixed** — the close-status "cannot evaluate" conflation; (earlier) the command-set
stamp and the absent-selection semantics.

**Left for post-V1** — Enrolling → Enrolled advancement, Form-requirement transition enforcement,
waiver/exception, Consent, Financials.

## 9. 🛑 Browser proof — still not performed

The tenant is repaired and clean, but I cannot open it. Authentication remains the one thing this lane
cannot do: the toolkit stores no passwords by design (*"Manual login only"*), the rotated cert
credential is deliberately not held here, and a credential-free session mint was refused by the
sandbox classifier — which I will not route around.

That is infrastructure I do not have a sanctioned mechanism for. Everything else in this run was done
without you.

## 10. READY TO PUBLISH: **NO — pending browser proof only**

Configuration is complete and validates clean. The only outstanding acceptance item is §8's browser
confirmation, which needs one sign-in.
