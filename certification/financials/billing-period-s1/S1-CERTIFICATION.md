# Financials V1 — Billing Period S1 foundation, deployed certification

**Deployed revision `51d4bb2a3f62dac9f8eac17f0953416dfe849ff6`** (PR #1391, squash-merged), confirmed
served by ancestry containment rather than by reading a label.

## What S1 is

The billing period is the period the CUSTOMER is billed for, so the calendar belongs to the account.
A LOCATION configures the default, because two locations may legitimately bill on different cadences
and anchors. Customer grain is what the census forced: 28 posted charges bind to the household rather
than to any agreement and reach no location at all, and 3 of 10 households have children at two
locations, so no traversal rule could have named one either.

## Schema, read from the deployed catalog

`financial_policies`: `customer_id` present (uuid, nullable); `scope_type` admits `customer`;
`policy_type` admits `billing_calendar` **and still admits `due_date`**, `billing_cadence`,
`posting_review` and `vacation_credit` — the restatement dropped nothing. `financial_policies_scope_shape`
is `validated` and covers all five scopes. Customer org parity is enforced inside the EXISTING
`validate_financial_policy_scope`, which now raises both a not-found and an org-mismatch for a
customer, on one trigger. `idx_financial_policies_org_customer` exists as a partial index.

`financial_billing_periods`: all **19** required columns, none missing and none unexpected. All **17**
constraints `validated` — ten CHECKs (anchor shape, cadence, calendar scope, calendar shape, close
actor, close actor shape, close shape, key, span, status), the exclusion, four foreign keys, the
primary key and the unique. Identity is `UNIQUE (org_id, customer_id, period_key)`. Overlap exclusion
is customer-scoped: `EXCLUDE USING gist (customer_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)`.
RLS enabled with both `financial_billing_periods_org_select` and `financial_billing_periods_service`.
Both triggers present, and `enforce_financial_billing_period_immutability` both freezes bounds and
refuses a reopen.

## Configuration, proved on deployed staging

Three location calendars were authored through the canonical policy authority, and the period table
started empty, so every row below is this proof's own.

| case | account | resolution | periods |
| --- | --- | --- | --- |
| A single-location inheritance | `e1c9afe0` | `location` scope, monthly, names `1a5644a7` | 2026-11 (Nov 1–30), 2026-12 (Dec 1–31) |
| B second account, same location | `fcaa839f` | same policy `7582fe97`, its OWN rows | 2026-11, 2026-12 |
| C different location | `fd…0c0002` | `location` scope, weekly from Mon `2026-01-05` | `2026-11-09~15`, `2026-11-16~22` |
| D multi-location, no override | `29944d3e` | **`ambiguous_locations`**, both named | **none — HTTP 409, nothing written** |
| E multi-location, explicit | `29944d3e` | `customer` scope, biweekly, `sourceLocationId: null` | `2026-11-09~22`, `2026-11-23~12-06` |

D refused both before any calendar existed and again once two DIFFERENT location calendars did. E's
provenance names no location, so an account calendar never asserts a household-to-location claim.

## Cadence

All five, on the deployed implementation, each pair contiguous with no gap and no overlap:
monthly 30/31d, weekly 7d, biweekly 14d, daily 1d, annual 365d from the anchor. Monthly is
anchor-free; every other cadence carries one.

## Term starts do not move a boundary

`e1c9afe0` holds agreements starting **2026-09-08, 2026-09-15 and 2026-09-22**; `fcaa839f` holds one
starting **2026-09-01**. Four different term starts, one shared calendar — and identical bounds,
2026-11-01→30 and 2026-12-01→31. The boundary came from the calendar.

## Empty periods, and idempotency

Twelve periods exist across six accounts, all `open`, none closed, and none holds any economic row —
nothing can reference one. Re-materialising account A returned the same two periods with
`created: false`, unchanged bounds and unchanged status.

## Side-effect free

**Zero** inbound foreign keys to `financial_billing_periods`, from any table. No billing-period column
on `charges`, `financial_reduction_applications`, `payments`, `payment_allocations` or
`resolved_obligations`. `financial_journal_entries` carries one — the pre-existing
`billing_period_key` text column from Thread 5, which S1 neither added nor reads. At source level the
only consumers are the new route, the two new modules and their two test files; no economic writer
touches any of it. `billing_calendar` remains absent from
`OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES`, and the authorable list is unchanged at six types.

On the deployed build the Financials card mounts, Accounts lists 12 accounts, and **0** S1 controls
render.

## W7

`add_charge_honours_review_boundary` is still `fail` / `PRODUCT_DEFECT` on `ea596e615`, observation
intact, `preserved: true`, `pass_rows: 0`. `core_financials_director_qa` unchanged at 4 answered /
0 pass / 1 fail / 3 not_run. W7 remains paused; no scenario advanced and none was marked PASS.

## One honest note

`Supabase Preview` went red on the first PR head and passed on the second. Before re-pushing, both
migrations were proved to apply cleanly IN ORDER against a real Postgres through a rolled-back dry run
on the shared cert stack — producing `financial_policies.customer_id`, the 19-column period table, 17
constraints and RLS — so the red was not a defect in this SQL. Its log is not readable from this lane.
