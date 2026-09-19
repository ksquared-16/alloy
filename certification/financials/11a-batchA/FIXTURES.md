---
title: Thread 11A — certification financial specimens (Sections 2/3)
status: sprint
---

# What Sections 2 and 3 put on the QA subject, and what must be undone

Recorded per §3J. This is an INVENTORY plus a reseed requirement — nothing here is deleted ad hoc,
because posted financial history is immutable by design and hand-deleting it would destroy the
lineage the provenance work exists to keep.

## Subject

`Certhouse Family` (children `Certa Certhouse`, `Certb Certhouse`), South Campus, org Firefly Early
Learning, hosted project `ikaxilmwmrmbagoidedu`.

## Specimens observed on the mounted candidate (61142365a)

| Specimen | Where it shows | Created by |
|---|---|---|
| `Sibling discount (QA specimen)` commercial policy, Active from 2026-01-01 | /settings/organization/financials?chapter=policies | Section 2 |
| Tuition charge $400.00 · Certa · September 2026 | Details · Charges lens | Section 2 (discount chain) |
| Discount −$40.00 · Certa · September 2026 · `10% of $400.00` · Ongoing | Details · Credits & adjustments | Section 2 (`billing.apply_discounts`) |
| Credit −$0.01 · Certa · September 2026 | Credits & adjustments | earlier 11A passes |
| Credit −$12.34 and −$7.77 · Certb · September 2026 | Credits & adjustments | earlier 11A passes |
| One-time charge $40.00 · Certb · November 2026 | Charges | earlier 11A passes |
| Late pickup $25.00 · Certa · August 2026 · Draft, GL 4040 | Financials → Charges | earlier 11A passes |
| Consumable fee $18.00 · unassigned responsibility | Details · current period | earlier 11A passes |
| Available prepaid $200.00 | Details · position | Section 1/2 prepaid work |
| Responsibility arrangement · `Cert Certhouse` $500.00 from 2026-09-06 | Charges → charge → RESPONSIBILITY ARRANGEMENT | earlier 11A passes |

Counts at time of record: 9 awaiting posting, 52 posted, 49 rows under Credits & adjustments.

## Cleanup / reseed requirement

**Do not delete.** `charges`, `financial_reduction_applications` and
`financial_responsibility_arrangements` are append-only/effective-dated by design: an arrangement is
superseded rather than edited, and a reduction application records a decision. Ad-hoc deletion would
remove the lineage that Sections 2 and 3 were built to make readable.

Before Human QA the representative subject must be returned to its intended governed starting state
through the canonical fixture/reseed mechanism — i.e. a reseed of the QA tenant subject, not a
targeted DELETE. This is a **Director-owned capability**: this lane has no write path to the hosted
fixture outside the product's own governed actions.

**REQUIREMENT — `THREAD_11A_QA_SUBJECT_RESEED`**: reseed `Certhouse Family` (and the
`Sibling discount (QA specimen)` commercial policy) to the governed baseline before Human QA begins.
Until that runs, the account carries certification specimens and its balances are not a QA oracle.

## Completion pass (run `erun_7cbcc98f3cd96d70`)

**No new financial specimens were created.** Both repairs in this pass are code; every mounted probe
was read-only. The §4B assignment was NOT executed, so no arrangement was written.

Position observed on candidate `30dcc2859`: eight charge details all report the same arrangement —
`Cert Certhouse $500.00 from Sep 6, 2026` (a FIXED share, which is one of the three methods
`financial_responsibility_arrangements` supports). The account does still hold an unassigned
obligation — `Consumable fee $18.00`, which the Focus Panel reports as `Unassigned $18.00` — so §4B
remains reachable on this subject without seeding anything new.

`THREAD_11A_QA_SUBJECT_RESEED` is unchanged and still required before Human QA.

## §4B assignment (run `erun_c77d344c534736c8`) — A REAL MUTATION

This pass executed one governed write on the Certhouse fixture. It is the only financial mutation
any Batch A run has made.

| | |
|---|---|
| Action | `billing.configure_responsibility` (existing authority; no new action) |
| Path | Financials → Charges → Posted → charge detail → **Manage responsibility** |
| Account | Certhouse Family |
| Grain | HOUSEHOLD (`customer_member_id: null`) — the panel's deliberate choice |
| Responsible party | `Cert Certhouse` (Primary contact) — the only candidate the authority offered |
| Share method | FIXED, `$18.00` (entered as dollars, sent as `amount_cents`) |
| Effective from | **2026-09-18** (the form's default — NOT backdated) |
| Supersedes | the prior arrangement `Cert Certhouse $500.00 from 2026-09-06` |

**The prior arrangement is CLOSED, not deleted** — `configureResponsibilityArrangement` closes a
predecessor the day before its successor starts and links the two, so the division that governed
early September is still readable. Nothing was undone by hand, and nothing should be: per the
instruction, the governed reseed owns cleanup.

`THREAD_11A_QA_SUBJECT_RESEED` now additionally requires the responsibility arrangement chain on
Certhouse Family to be returned to its governed baseline — the `$500.00 from 2026-09-06` arrangement
and its successor both.

## Section 4 final pass (run `erun_0e1374d1331f3547`) — further mutations

| | |
|---|---|
| Charges created | `Late pickup $25.00 · Certa Certhouse · Sep 18 2026` (charge `6005cf5f-24e8-4fd2-a624-0bc83496b977`) via `charge.add`, plus its multi-child sibling for Certb where the Add committed |
| Repeats | subsequent identical Adds returned `unchanged` through `tpl:late_pickup:2026-09-18:<agreement>` — no duplicates |
| Responsibility | `billing.resolve_responsibility` was CONFIRMED against the historical `f089a3f4` (Sep 2) and against `6005cf5f` (Sep 18) |

Resolving `f089a3f4` is the non-retroactivity proof and leaves it honestly Unassigned. Any allocation
rows written by these resolutions are effective-dated/superseding records and must NOT be deleted by
hand.

`THREAD_11A_QA_SUBJECT_RESEED` now additionally requires: the Sep 18 Late pickup charges created by
this pass, and any `financial_responsibility_allocations` written by the two resolve confirmations.

## Section 4 final resolution probe (run `erun_df57dbc91108d60c`)

| Mutation | Identity |
|---|---|
| Registration fee $75.00 · **Certb Certhouse** · Sep 18 2026 | `907d1b64-09d5-4926-bed0-63d044c15441` (via `charge.add`) |
| Registration fee $75.00 · **Household** · Sep 18 2026 | `2279460a-0b4e-4d31-9d86-3a00a4d4daf4` (via `charge.add`, household grain) |
| Responsibility allocations on `907d1b64` | `billing.resolve_responsibility` → `kind: resolved`, arrangement `30d94536-691b-465a-933d-288b5249301c`, 2 allocations, net $75.00, unassigned $57.00 |
| Resolve attempts that wrote nothing | `6005cf5f` (refused `fixed_exceeds_net`), `f089a3f4` (stays unassigned — non-retroactivity), `2279460a` (refused `not_allocatable`) |
| Arrangement authoring attempts that wrote nothing | two `billing.configure_responsibility` executes refused `predecessor_starts_later` |

The allocations on `907d1b64` are effective-dated, superseding records. **Do not delete them by hand.**

`THREAD_11A_QA_SUBJECT_RESEED` now additionally requires: both Sep 18 registration fees and the
responsibility allocations written against `907d1b64`.

## B1 closeout (run `erun_53d2105805741201`)

| Mutation | Identity |
|---|---|
| Registration fee $75.00 · **Certa Certhouse** · Sep 18 2026 | via `charge.add`, key `tpl:registration_fee:2026-09-18:4e3aa47e…` |

No tuition was generated (nothing was billable), no payments were recorded, and no responsibility
was written this run. Everything else observed was already on the fixture.

**FOR THE B2 RESEED — `THREAD_11A_QA_SUBJECT_RESEED` must additionally ESTABLISH, not just clean:**
a recurring billing specimen. There is currently none — no accepted `enrollment_pricing_terms`, so
`billing.generate_tuition` has nothing to bill for any period. If Human QA is meant to exercise
recurring billing at all, the reseed has to build the commercial tree (tuition plan → billing
frequency → enrolment commitment → assignment → accepted terms), ideally one WEEKLY and one MONTHLY
so both cadences are exercisable.

## B1 final closure (run `erun_6316fc1a23a34af7`)

**Certification residue created this run** (remove at reseed):

| Mutation | Identity |
|---|---|
| Field trip $40.00 · Certa Certhouse · Sep 18 | `1bfb2795-58dd-4c84-a04c-212917150ab9` |
| Field trip $40.00 · Certb Certhouse · Sep 18 | `34d1fd8c-bdab-4a82-9fcc-83068c90f711` |

Both via one multi-child `charge.add`; the rerun created nothing.

## INTENTIONAL HUMAN-QA SETUP — rebuild after the reseed, do not merely delete

These are **configuration**, not transactions, and Human QA needs them:

| Setup | Why |
|---|---|
| Due-date policies (`on_invoice` from Sep 18; `days_after_invoice 10` from Sep 19) | the only way to exercise due-date behaviour |
| `Sibling discount (QA specimen)` commercial policy | discount + provenance scenarios |
| Responsibility arrangements (household and child grain) | responsibility scenarios |
| **MISSING — must be BUILT: accepted `enrollment_pricing_terms`, one WEEKLY and one MONTHLY** | without these, recurring billing cannot be tested at all |

The weekly one additionally needs a **weekly billing frequency** on a tuition plan; the tenant
currently has Monthly and Semi-Annual only. The canonical writer is the registered
`enrollment.pricing.accept` action (operator surface: `AssignmentTuitionCard`, which is **not**
mounted on the enrolled-children Focus Panel).

## Core closure run (`erun_136ed6ec4b461461`) — certification residue

| Mutation | Identity |
|---|---|
| Payment allocation $75.00 → Registration fee `907d1b64` | allocation `a17f53c4-e4f8-454c-9d34-27f42bea6a7f`, payment `7ca91075-1b80-4584-a722-c769d5241ff8` |

Account now sits at **Balance −$37.13** with **$125.00 available prepaid** — a certification state,
not a Human-QA starting state. See `11a-cf/HUMAN-QA-FIXTURE-BLUEPRINT.md`.

No commercial configuration was created this run; the four missing pieces are named in the blueprint.
