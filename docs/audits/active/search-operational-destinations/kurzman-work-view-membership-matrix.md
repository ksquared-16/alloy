# Kurzman Work View membership matrix — live staging evidence

**Sprint:** `search-operational-destinations` · slot 4 · **read-only**, no staging mutation.

## Provenance

This matrix is assembled from **merged staging evidence**, not from re-running staging myself:

| Source | What it establishes |
|--------|---------------------|
| `enrollment-e2e-tour-work-view-membership/staging-family-grain-hosts.json` | per-view terminal, row count, row **subjects**, `rowGrain` — captured against `https://staging.workwithalloy.com` |
| `.../staging-family-grain-repro-v2.json` | the 7-pill strip, per-view counts, Lennon/Wrigley/family presence per step |
| `.../api-qa-provisioning-tours.json` | `settlement.workViewCountTargets` — each view's **host Work Unit + base lane** |
| `.../api-probe.json` | per-lane `grain` (`lifecycle_lead`→`case`, `lifecycle_waitlist`→`candidate`) |
| `.../api-qa-membership.json`, `api-qa-overlap.json` | the case row, its stage, and the active tour booking |
| `docs/sprints/active/enrollment-e2e-certification-ledger.md` | the **published** Tours predicate set |

Captured 2026-08-13/14 by the EPP sprint (slot 5) and merged as PR #423. I have **not**
re-observed staging live — no staging operator credentials exist in this repo
(`CERT_OPERATOR_EMAIL`/`CERT_APP_URL` are unset for staging). See "Open gap" below.

## Subjects

| Field | Value |
|-------|-------|
| Family case (opportunity) | `d097e1a8-c3c0-4c51-a113-2275b009b9a9` — "Kurzman Family" |
| Case host Work Unit | `587de5bc-…` — **New Leads** (`lifecycle_lead`) |
| Case stage (displayed) | `waitlist` — row reads "Waitlist · Tour Scheduled" |
| Active tour booking | `daa73d80-…`, `status_key: confirmed`, `start_at 2026-08-14T16:00Z` |
| Children | **Lennon** (2y4m) and **Wrigley** (4m), both on `lifecycle_waitlist` |

## Configured Enrollment Work Views

Host + lane from `settlement.workViewCountTargets`; grain from the lane's own `grain`
plus `resolveLensRowGrain`.

| View id | Label | Host WU | Base lane | Lane grain | Count |
|---------|-------|---------|-----------|-----------|------:|
| `new_leads` | New | New Leads | `lifecycle_lead` | family (case) | 0 |
| `new_work_view_2` | Active Pipeline | `a428520f` | `lifecycle_qualification` | family | 0 |
| `new_work_view_3` | Registration | Tours WU | `lifecycle_tour` | family | 0 |
| `new_work_view_4` | **Waitlist** | Waitlist WU | `lifecycle_waitlist` | **child** (candidate) | **2** |
| `new_work_view_5` | **Tours** | New Leads | `lifecycle_lead` | **family** | **1** |
| `new_work_view_6` | **All** | New Leads | `lifecycle_lead` | **family** | **1** |

Observed row subjects — the decisive evidence:

* `new_work_view_4` (Waitlist) → **2 rows: "Wrigley Kurzman", "Lennon Kurzman"** · `rowGrain: child`
* `new_work_view_6` (All) → **1 row: "Kurzman Family"** · `rowGrain: family`
* `new_work_view_5` (Tours) → **1 row: "Kurzman Family"** · `rowGrain: family`,
  `subjectGrain: { grain: "case", subjectType: "opportunity" }`

### Overlapping cohorts are real, and are not stages

The ledger records the **published** Tours configuration:

```
row_grain_v1: family
predicates:   has_active_tour = true  AND  tour_date = next:7:days
              (deliberately NO opportunity_stage = tour —
               "that kept Waitlist families out")
```

So the Kurzman Family is simultaneously in **All** and **Tours** while its stage is
`waitlist`. Tours membership comes from a **booking**, not a stage. This alone disproves
"one stage → one Work View" as a membership rule.

## Matrix — LENNON (child grain)

| Work View | Configured | Membership true? | Accessible? | Operational? | Should Search offer? |
|-----------|-----------:|-----------------:|------------:|-------------:|---------------------:|
| New | yes | **no** — family lens | n/a | operational | **no** |
| Active Pipeline | yes | **no** — family lens, 0 rows | n/a | unproven | **no** |
| Registration | yes | **no** — family lens, 0 rows | n/a | unproven | **no** |
| **Waitlist** | yes | **YES — Lennon is a row** | yes | **operational** | **YES** |
| Tours | yes | **no** — family lens | n/a | operational | **no** |
| All | yes | **no** — family lens | n/a | operational | **no** |

**Lennon has exactly one truthful operational Work View destination: Waitlist.**

The exclusions are grain, not permission. The platform states the rule itself in
`lib/runtime/provisioning/childGrainScope.ts`:

> "a family lens is not a place a child can be, so it is not a destination to offer."

`All` and `Tours` are family-grain: their row is the **Kurzman Family**, not Lennon.
Offering them as *Lennon* destinations would land the operator on a family row and claim it
was Lennon — the same class of substitution the reported defect makes.

## Matrix — WRIGLEY (child grain)

Identical to Lennon: same lane, same stage, same host. `new_work_view_4` holds **both**
children, so its count is 2. Wrigley → **Waitlist** only.

Sibling independence is therefore *not* demonstrable on live staging today — both children
occupy the same stage. It is proven in the automated fixtures instead.

## Matrix — KURZMAN FAMILY (case / household grain)

| Work View | Configured | Membership true? | Accessible? | Operational? | Should Search offer? |
|-----------|-----------:|-----------------:|------------:|-------------:|---------------------:|
| New | yes | no — 0 rows | yes | operational | no |
| Active Pipeline | yes | no — 0 rows | yes | unproven | no |
| Registration | yes | no — 0 rows | yes | unproven | no |
| Waitlist | yes | **no** — child lens | n/a | operational | **no** |
| **Tours** | yes | **YES** — `has_active_tour` | yes | **operational** | **YES** |
| **All** | yes | **YES** — catch-all | yes | **operational** | **YES** |

The household has **two** memberships; Lennon has **one**; and they are disjoint. A union in
either direction would be a fabrication.

## Why the current destination lands on "New" with 0 records

Mechanically:

1. The family case's `opportunities.work_unit_id` is `587de5bc` = **New Leads**.
2. Search's destination carries that host, and the host's default active view is
   `new_leads` = "New".
3. `new_leads` evaluates to **0 rows** for this tenant.

So the operator is delivered to a real, operational, *empty* view that contains neither
Lennon nor the family. The label "Enrollment — Waitlist" was read from Lennon's own
`process_instances.stage_key` (child grain, correct) while the destination came from the
case's work unit (family grain) — the two-grain split.

PR #422 added `fetchStageWorkViewTargets`, which binds stage → view by `compat_queue_key`.
That is **not sufficient here**, for a reason the runtime states plainly
(`workUnitProvisioningAnswer.ts:26`):

> "It never reads `compat_queue_key` (a lane binding assigned by array position)."

The runtime authority refuses that key as identity. A stage-bound lookup also cannot express
Tours (booking-predicated) or All (catch-all) at all. Hence the correction: **membership, not
stage binding.**

## Open gap

Raw `filters_v1` / `compat_queue_key` per view were not captured by the artifacts; the Tours
predicate set is taken from the ledger's record of the published config. Confirming the other
five views' raw predicates, and re-observing all of the above live, needs **staging operator
credentials**, which this repo does not carry.
