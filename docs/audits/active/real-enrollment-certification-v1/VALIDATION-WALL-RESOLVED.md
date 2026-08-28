# The validation wall — 20 messages, 3 problems, 1 of them ours

**Run:** `erun_397a46e7022c1e5e` · **Draft not mutated by me** · Not published

## 1. Did the packet selection cause these? — **Partly, and not the way it looks**

Causality tested by validating the pre-packet payload and the current one:

| | Errors |
|---|---|
| Pre-packet draft (untouched) | **9** — all `stage_operating_contract` |
| Current draft (after packet selection) | **20** — 9 + **11** `process_command_set_incomplete` |

So **9 were exposed, 11 were caused** — but not by choosing a packet. They were caused by *saving*.

**The packet selection itself worked.** `draft_revision` 2, `enrolling` carries **5** requirements,
description intact, and the diff is the 14 documented normalization changes plus `requirements_v1`
— plus one line I had not predicted:

```
processes[0].command_set_v1: ADDED = { "version": 1, "commands": [] }
```

## 2. Root cause of the 11 — a migration that stamps an authored empty

`ensureProcessCommandSetV1OnSave` stamps `command_set_v1` on every save. It derives the set from two
inputs, and **both are empty in this tenant**:

* `stage.action_catalog_v1.candidate_actions` — no stage has an `action_catalog_v1` (all 8 absent);
* configured-action placement rows — the save path calls `ensureBuilderCommandSetsOnSave(config)`
  **with no options**, so they are never passed. The org has **60 `action_placements`**; the migration
  simply never sees them.

Empty + empty → `commands: []`, stamped. And the guard directly above reads:

> *"Explicit empty remains intentional — do not migrate-fill."*

So the first save froze it. Meanwhile `validateProcessCommandSetsForPublish` **skips an absent
section** and reports every Work Template action as un-selected against an empty one. The save
converted *"nobody has chosen commands yet"* into *"the operator chose none"* — with nobody choosing
anything.

Same defect class as the `description` round-trip: **presence is authority, and a migration must not
manufacture presence.**

**Fixed.** A migration that found nothing now leaves the section absent. A deliberate empty selection
still survives untouched. Verified on the real payload: **20 → 9**.

**This is also the Direct Command / Helpful Action selector defect** from two runs ago. Those pickers
filter on the same selection, so the stamped-empty emptied them. One root cause, two symptoms.

## 3. Family → child: the validator is right, and the primitive already exists

The 6 grain errors on Decision/Tour are **correct rejections**. The model is explicit:

* a **stage transition** must match grain — a family stage's paths lead to family stages;
* an **individual child** is moved to a child-grain stage by a **participant decision** on a work
  template. The validator's own words: *"Per-child paths must lead to a stage that holds children."*

So the family→child handoff is **not** a stage transition. Decision's paths to Waitlist/Enrolling
should be authored as **participant decisions**, which is exactly the process-participation doctrine.

**Do not flatten grain**, and do not touch the validator — it is enforcing the intended model. The
repair is configuration on the Decision stage.

## 4. Closed status: the key referenced does not exist

Three "Close as Lost" transitions (lead, tour, decision) carry `status_key: "closed"` with
`closes_record: true`. The tenant's configured `opportunities` statuses are:

`new_inquiry · needs_qualification · qualified · lost · not_enrolling · aged_out · not_a_fit`

**There is no status keyed `closed`.** The canonical terminal status matching those transitions'
intent is **`lost`** (`terminal: true`, `stage_key: closed`, family track) — which also matches their
label exactly.

**Repair:** point the three transitions at `lost`. Reuses the Status & State system; invents nothing.

## 5. Validation is now readable

The bar leads with **"3 configuration areas need attention"** and groups behind disclosures — Stage
movement / Statuses / Commands & actions. Nothing hidden: every error, code and path is one click
away. Grouping keys on error **codes**, not copy, so a reworded message cannot re-group itself; the
single exception is `stage_operating_contract`, which genuinely spans grain and status, and a control
pins that it splits 3/6 the way the real wall does.

## 6. Certified configuration — intact

`enrolling.requirements_v1` holds exactly **5** `kind: form` requirements, in certified order:

1. Oregon Certificate of Immunization Status · 2. Oregon Nonmedical Exemption ·
3. School of Enrichment Admissions Packet · 4. Tuition & Enrollment Agreement ·
5. Parent Handbook Acknowledgement

All `required · record · stage_exit · blocking`. **No Direct Payment Authorization.** No packet id
stored. `entry_points_v1` is still **null** — the entry point has not been authored yet.

## 7. READY TO PUBLISH: **NO** — two configuration repairs remain, both yours

The code fix removes 11 errors on the next save. **9 remain**, and they are pre-existing configuration
gaps that need the product:

1. **Statuses (3)** — repoint the three "Close as Lost" transitions from `closed` to `lost`.
2. **Stage movement (6)** — re-author Decision's family→child paths as participant decisions rather
   than direct transitions/outcome movements.

Then: **Begin new enrollments in Enrolling** → **Validate** → **Publish**.

Neither repair touches the certified Forms, the Studio packet, or the five requirements.

## 8. What I did not do

No draft mutation, no publish, no validator weakened, no grain flattened, no command invented, no
stage removed. Browser proof still owed — no session in this lane.
