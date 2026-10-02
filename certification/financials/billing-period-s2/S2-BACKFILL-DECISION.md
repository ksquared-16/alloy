# S2 — `FINANCIALS_BILLING_PERIOD_S2_HISTORICAL_BACKFILL_DECISION_REQUIRED`

Censuses only. No schema change, no writer change, no migration. Deployed `51d4bb2a3f`.

## Assignment determinism: SATISFIED

Every historical charge can be placed from historical facts alone.

- **132 charges, 132 resolve a customer.** 28 `customer`-grain (the household *is* the customer) and
  104 `enrollment_agreement`-grain (through `customer_members`). **0 unresolved.** No `job`-grain
  charge exists on this spine, which is correct — job billing owns its own lifecycle and the
  correction-lineage trigger already exempts it.
- **132 are placed by a DECLARED date**: 72 by `billable_on`, 60 by `service_date`. **Zero** fall
  through to `created_at`. So there are no rows placed by inference, and none with insufficient
  historical information.
- 6 distinct customers; **13** distinct (customer, legacy month) pairs; 2026-08 through 2026-12.
- The only historical witness agrees: 95 of 231 journal entries carry a `billing_period_key`, 4
  distinct, and **0 are non-monthly shaped**. Legacy semantics were monthly, as discovery said.

Nothing here needs current configuration. §16's determinism bar is met.

## What blocks S2: representation, not assignment

§16 also asks *"Do any historical rows map to overlapping customer periods?"* **Yes — one.**

```
customer 29944d3e   legacy 2026-12  (2026-12-01..2026-12-31, 1 charge)
  collides with     biweekly  2026-11-23~2026-12-06   (2026-11-23..2026-12-06)
```

A legacy monthly period row for December cannot be written, because S1's certified invariant —
`EXCLUDE USING gist (customer_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)` — forbids one
customer holding two commercial clocks over the same day. The constraint is doing exactly its job.

**This is not a one-row curiosity.** It is general: whenever a customer's canonical calendar is
anything but monthly, its periods necessarily overlap the legacy months that contain their historical
charges. It shows up once here only because this estate is small and canonical periods exist for
Nov–Dec 2026. A real tenant on a weekly calendar with a year of history would collide in *every*
month. The single instance is the general conflict made visible, and it sits between two things both
locked: §3/§4's legacy monthly representation, and S1's non-overlap invariant.

## The three ways out

**A — Cutover boundary per customer; canonical periods never precede it.** Legacy months cover
`[…, cutover)`, canonical periods `[cutover, …)`. No overlap by construction. Costs: the S1 proof
fixtures already sit in Nov–Dec 2026 (one annual period spans 2026-01-05→2027-01-04) and would have
to be removed or the cutover set after them; and a canonical period straddling the cutover date is
itself an overlap.

**B — Do not represent legacy membership as period rows at all (recommended).** Pre-cutover charges
carry `billing_period_id = NULL` plus a frozen `legacy_billing_period_key` holding the monthly label
Alloy historically showed. Membership is preserved *as the thing history actually meant*, no period
row fights the exclusion constraint, S1's invariant is untouched, and §12 is satisfied because the
text key cannot disagree with an id that is NULL — it classifies as HISTORICAL ONLY. §4's
materialisation clause is conditional (*"if historical economic rows need canonical
`billing_period_id`"*), and under B they do not. The cost is honest and small: pre-cutover charges
have no period row, so a future close cannot close them — which §3 already implies, since closed
history is final and closing the past was never the goal.

**C — Relax the exclusion constraint** so legacy and canonical periods may overlap, distinguished by
provenance. Rejected on its merits: it reintroduces two clocks over one day, which is the precise
failure S1's constraint was certified to prevent.

## Direct-bind / derive / no-period matrix, from the deployed catalog

| object | carries today | classification | reasoning |
| --- | --- | --- | --- |
| `charges` | `billable_source`, `service_date`, `due_date`, `occurs_on`, `billable_on`; **no** customer_id, no period | **A · direct bind** | the economic fact whose commercial membership is the question; nothing else can hold it |
| `financial_reduction_applications` | `customer_id`, `charge_id`, `period_key`, `period_start`, `period_end` | **A · direct bind** | S5 needs economic period to differ from source period, so it cannot derive through `charge_id` |
| `resolved_obligations` | `draft_charge_id`, `location_id`, `occurs_on`, `billable_on`, `period_start/end` | **B · derive** | it points at its charge via `draft_charge_id`; a second period truth could disagree, and an obligation with no charge has no economic fact |
| `financial_journal_entries` | `customer_id`, `billable_source`, `billing_period_key`, `effective_on`, `accounting_period_id` | **B · derive** (commercial) | `accounting_period_id` stays the bookkeeping authority; commercial period derives through the source row. `billing_period_key` becomes a CANONICAL DERIVATIVE |
| `payments` | `customer_id`, `billable_source` | **C · no period** | account-wide settlement; one payment may settle charges from several commercial periods |
| `payment_allocations` | `charge_id` only | **B · derive** | reaches the period through the charge it settles; needs no period of its own |
| `financial_responsibility_allocations` | `charge_id`, `period_key`, `service_date` | **B · derive** | the divided net of one charge; its `period_key` is a COMPATIBILITY field, not an authority |

## §10 is wider than discovery reported — six sites, not three

Three merely *parse* a monthly key; three **mint** one with `.slice(0, 7)`, which is the more
damaging half because it manufactures a monthly identity for a non-monthly org:

- `reductions/reductionPeriod.ts:8` — throws unless `^\d{4}-\d{2}$`
- `reductions/forecastAssignmentReductions.ts:100` — `billingPeriodBounds(args.periodKey)`
- `reductions/applyFinancialReductions.ts` — imports the same bounds helper
- `api/.../proposed-charge-discounts/route.ts:71` — `billingPeriodBounds(serviceDate.slice(0, 7))`
- `api/.../proposed-charge-discounts/route.ts:134` — `periodKey: period.start.slice(0, 7)`
- `reductions/manualReductionService.ts:158` — `periodKey: input.periodKey ?? input.effectiveDate.slice(0, 7)`
- `reductions/readAssignmentDiscountPosition.ts:106` — `periodKey = (…).slice(0, 7)`

Live reduction data is consistent with monthly-only: 51 rows, all carrying `charge_id` and
`period_key`, **1** distinct key, **0** non-monthly shaped.

**This work is not blocked by the backfill decision** and can proceed on its own.
