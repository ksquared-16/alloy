# Financials V1 — Billing Period S2, deployed certification

Deployed **`2befaf1624edea47e4f5cded93b9bfc4dd2c9b29`** (PR #1393, squash), confirmed served by
ancestry containment. Migrations applied in the expand/deploy/contract order below.

## Deployment order, and why it is two migrations

The single migration could not ship safely — the incompatibility is two-sided. Migration-first breaks
the old writers on the childcare CHECK; code-first breaks the new writers on columns that do not yet
exist. So:

1. **`20261115120000`** (expand) — additive only. Applied immediately after merge, while the old
   writers were still serving. **Proved on real Postgres** that this intermediate state accepts an
   old writer's childcare insert, so there is no broken window.
2. **the writers deployed** — staging confirmed serving `2befaf162` before continuing.
3. **`20261116120000`** (contract) — adds `charges_billing_period_childcare_chk` and converts
   anything the window produced by freezing it as legacy from its own declared dates.

## Deployed schema

Six new columns: `billing_period_id`, `legacy_billing_period_key`, `billing_period_generation` on
both `charges` and `financial_reduction_applications`. On charges the generation is `NOT NULL DEFAULT
'not_applicable'` (the exempt job/pricing vertical); on reductions it is `NOT NULL` with no default,
because every reduction reduces a childcare charge.

Seven constraints, all `validated`: the generation vocabularies, both shape rules, the childcare
guard, and a foreign key on each table. Both immutability triggers present. **S1's overlap exclusion
is unchanged** and still validated.

## History preserved, not reinterpreted

| | |
| --- | --- |
| legacy charges | **132** — `billing_period_id` NULL on every one, legacy key frozen on every one |
| legacy months | 2026-08 (4), 2026-09 (110), 2026-10 (8), 2026-11 (9), 2026-12 (1) — all `period_id` NULL |
| legacy reductions | **51**, all with a frozen key, **0** with a period id, all 51 matching their own `period_key` |
| canonical period rows invented for history | **0** |

Because no legacy charge carries a period id, the census's legacy-December-versus-biweekly overlap
causes nothing. That is the whole reason option B was chosen over materialising legacy period rows.

## Canonical binding, on deployed

Four charges created through the deployed action envelope, each naming a persisted period that
**contains** its date:

| charge | period | span | cadence | scope |
| --- | --- | --- | --- | --- |
| `a57b8725` | `2026-12` | 2026-12-01..12-31 | monthly | location |
| `974ef27e` | `2026-12` | 2026-12-01..12-31 | monthly | location |
| `540b87f6` | `2026-11-30~2026-12-06` | 7 days | **weekly** | location |
| `3685fc71` | `2026-11-23~2026-12-06` | 14 days | **biweekly** | **customer** |

All `generation = canonical`, all `legacy_billing_period_key` null. Generations separate cleanly:
132 legacy (0 period ids) and 4 canonical (4 period ids). Weekly and biweekly are the shapes the old
monthly-only implementation could not express.

**Two charges, one open period:** `e1c9afe0`'s `2026-12` holds 2 charges, gross 8000, status `open`.
React chose no period id — the payload carries only `template_id`, `event_date` and `customer_id`.

## Multi-location refusal

`50b19065` (two locations, no account calendar): **0 canonical charges, 0 charges on the date, 0
periods held.** Nothing was written and nothing was invented. The refusal carries the operator
sentence about attending more than one location.

## Configuration change does not regroup history

Account `e1c9afe0` resolved monthly from its location (policy `7582fe97`) with periods 2026-11,
2026-12, 2027-01. A **weekly account calendar effective 2027-03-01** was then authored. Resolution on
2026-12-10 is unchanged — same cadence, same policy, and the period rows are byte-identical
(`SAME period rows as before: true`). On 2027-03-10 the new calendar governs. B applies only when
effective.

## Payments, Autopay, accounting

Payments and allocations gained **no** period column; `resolved_obligations` gained no
`billing_period_id`. A payment with 32 allocations acquired no period identity. `autopayCollectible`
and `autopayHandler` contain **zero** references to `billing_period`, so Autopay cannot consume a
period total — it resolves `amountDueCents` and `nextDueDate` from due charges, and both surfaces
still answer. The journal gained no commercial period column: 235 entries, 94 attributed to an
accounting period, 141 `no_calendar` — accounting attribution is untouched and independent.

## Cadence convergence

All seven measured sites. `reductionPeriod.ts` is deleted, `billingPeriodFromKey` is the one bounds
authority, and no `.slice(0, 7)` acts as a period authority. Two real defects surfaced while writing
the tests: the discount route decided a weekly household's eligibility window by calendar month — the
same slice that made it answer 500 for weekly assignments — and the legacy monthly label is now one
named function rather than a slice repeated in passing.

## W7

`add_charge_honours_review_boundary` still reads `fail` / `PRODUCT_DEFECT` on `ea596e615`, observation
intact, `preserved: true`, `pass_rows: 0`. `core_financials_director_qa` unchanged at 4 answered /
0 pass / 1 fail / 3 not_run.

## Four things stated plainly rather than buried

1. **`Supabase Preview` was red at merge.** It is not a required check — a required failure reports
   `BLOCKED`, and this reported `UNSTABLE` — and it passed on PR #1391 with the same tooling. Its log
   is not readable from this lane. Independent evidence the SQL is sound: all four migrations applied
   in order against real Postgres over 8,966 existing charges, plus the expand-only window test.
2. **The multi-location refusal surfaces as HTTP 500 / `INTERNAL`.** The required behaviour holds —
   it refuses before writing, and nothing was created — but an operator-resolvable configuration
   state should answer 4xx, as the billing-periods route already does with 409. Recorded, not fixed:
   it is surface legibility, and S2's boundary is economic binding.
3. **"One payment across two commercial periods" is NOT proven.** Every multi-allocation payment in
   this estate settles legacy charges, whose period ids are null, so there is no period to span. What
   is proven is the structural claim: payments and allocations hold no period identity.
4. **The open-period example landed in December, not November.** The Field trip template's
   `billable_on` strategy bills the next cycle, which is the same behaviour certified in the W7 work.
   The invariant §12 asks for — two charges in one open period, membership unmoved — is proven; the
   month label differs from the example's wording.

Also honest: the schema census's q8 filtered only `customer`-grain charges, so its zero does not
prove what it was written to prove. The overlap conclusion rests on q5–q7 instead — no legacy charge
carries a period id at all.
