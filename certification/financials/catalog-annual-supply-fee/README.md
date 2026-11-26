# Why "Annual Supply Fee" is not offered by Add Charge

Measured 2026-11-03 against Firefly staging (`alloy_deployed_primary`, the backend both
`staging.workwithalloy.com` and the lane's local candidate read). Configuration only; no customer data; no write.
Census `annual-supply-fee-census.sql`, governed `gar_5e76f65bf33870`, executed `tha_d2776d0753932b`,
result `annual-supply-fee-census.sql.results.json`.

## The item, link by link

| Check (in the order `evaluateCatalogCharge` applies them) | Annual Supply Fee | Blocks? |
|---|---|---|
| Active | `is_active = true` | no |
| In effect today | from 2026-07-22, no end | no |
| Location scope | all locations (`location_id` null) | no |
| **Frequency** | **`cadence_key = annual`** | **yes — `catalog_recurring_not_manual`** |
| Type | `fee` (not deposit / add-on) | no |
| Program scope | none | no |
| Price | $200.00 | no |
| Revenue category | "Supply Fees", active | no |
| GL account | 4030 · Supply Fees, revenue, active | no |
| Posting mapping | `consumable_revenue` resolves to 4030 (no own `catalog_gl_account:` key; not needed) | no |

**The frequency is the only reason.** Its posting chain is complete: were it one-time, it would be offered
today at $200.00, posting to 4030 · Supply Fees. "Registration Fee" ($100) is withheld for the same single
reason (the card read model reports it `unsupported`, Annual), measured through the candidate on the same
backend.

## Is "recurring Catalog items are not billed by a flow yet" true? Yes — verified, not assumed

On the candidate (`67f0f455` + this work) and on `origin/staging` (`daf87893`):

- Periodic billing bills **tuition pricing terms only**: `readOutstandingBillingPeriods.ts` keeps tuition terms,
  `generateTuitionCharges.ts` / `resolveTuitionRecurrence.ts` filter `termKind === "tuition"`, and the database
  constrains `enrollment_pricing_terms.term_kind in ('tuition')` with source `commercial_tuition_rates`
  (`20260906120000_enrollment_pricing_terms.sql`).
- Enrollment fees are charge templates (`resolveEnrollmentFeeObligations.ts`), never `commercial_products`.
- `resolveProducts` puts Catalog items into commercial previews only; `commercialValuation` keeps the tuition
  line. Nothing inserts a charge for a recurring Catalog item.
- Staging has no Catalog charging at all; the one-time Catalog Add Charge exists only in this sprint.
- `behavior.required = true` on the item is not read by any billing path either.

Nothing was changed: its frequency is untouched, no charge was created, and Add Charge no longer lists it.

## Smallest correct path to bill it (OUTSTANDING — not in this sprint)

Extend the existing periodic run; do not add a scheduler.

1. Migration: allow `term_kind 'fee'` with `source_entity = 'commercial_products'` on `enrollment_pricing_terms`,
   so an enrollment's accepted annual fee is stored per assignment beside its tuition term.
2. `readOutstandingBillingPeriods` / `resolveTuitionRecurrence`: carry that term kind, grouped by
   `(termKind, cadence)` so an annual fee beside monthly tuition is not refused as multi-cadence. Annual periods
   already exist (`billingPeriod.ts`, anniversary-to-anniversary from the agreement anchor).
3. `generateTuitionCharges`: emit the fee with its own event and charge key, and scope the posted-charge lookup and
   dedupe key by term kind, so the fee and tuition never collide.
4. Decide with the operator who receives it: which enrollments accept the fee (`behavior.required` today says all),
   proration on mid-period start, and whether a sibling/household grain applies.

Interim operator choice (not recurring billing, and not done here): change the item's Frequency to One-time in
Organization › Financials › Catalog and add it by hand each year — it would then be offered immediately.
