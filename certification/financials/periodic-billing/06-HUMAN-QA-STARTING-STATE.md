# Human-QA starting state — Financials, automatic Billing ACTIVE

**Human QA PASS: ZERO / 44.** Nothing below is a QA result; it is the state the walkthrough would
start from.

## Deployment

| | |
|---|---|
| Deployed SHA at activation | `486ea3eb9660ebf6a014072a5a7d391d06644b35` (contains `c361680a9` and `8caabeb62`) |
| Branch / env | `staging` / `production` |
| Deployment | `dpl_G3f3fSqQeGJfwA15wSzqqkZdHzKR` |
| Supabase project | `ikaxilmwmrmbagoidedu` |

## Automatic Periodic Billing — ACTIVE for Firefly

| | |
|---|---|
| Organization | Firefly Early Learning `93667019-bd28-49b5-a688-acc9bb1e0a19` |
| Schedule id | `5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a` |
| Handler | `financials.periodic_billing.evaluate` (productized) |
| Recurrence | `daily`, activated `2026-09-22T01:13:18Z` |
| Next evaluation | `2026-09-23T01:13:18Z` |
| Automatic catch-up limit | 2 canonical Billing Periods per assignment |

**First real-clock wake, from the scheduler's own rows:** occurrence `525abf56-f77e-4dae-8726-2ab044909bd8`
due `01:13:18Z`, claimed by `worker-8f1d1122` with the lease `applied`, attempt 1 completed at
`01:15:02Z`, outcome `completed`, domain result `no work due` across 2 assignments evaluated.

The clock is the real one: pg_cron every 5 minutes, wake count 72 at observation.

## Certhouse — unchanged by activation

| Assignment | Cadence | Accepted price | Charges | Outstanding |
|---|---|---|---|---|
| Certa Certhouse (`79f8011d…`) | weekly | $185.00 overridden, from 2026-09-01 | 5 drafts: 09-01, 09-08, 09-15, 09-22, 09-29 | **0** |
| Certb Certhouse (`cf044308…`) | monthly | $1,450.00 accepted, from 2026-09-01 | 09-01 **posted**, 10-01 draft | **0** |

Every charge carries its original `created_at` of 2026-09-19. Activation created nothing and
recalculated nothing. Accepted terms, responsibility, discounts and payments are untouched.

Discount policy: `Sibling discount (QA specimen)` `5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0`, 10% off
everything, whole organization, from 2026-01-01. Available prepaid $125.00. Accounting: due-date
policy configured; **no proration policy** — a partial period refuses rather than being billed.

## Three consumers, one runtime

| Consumer | State |
|---|---|
| Periodic Billing | **ACTIVE** — productized handler, Firefly schedule provisioned, real clock dispatched it |
| Autopay | **PRODUCTIZED CAPABILITY / NO STAGING SCHEDULE INSTANCE** — handler registered and untouched; zero autopay `scheduled_work` rows exist, so no live dispatch is claimed |
| Charge Aging | **SHADOW** — `evaluated("charge_aging", …)`, `mutation: not_productized_v1` |

One clock, one due-work model, one claim/lease, one dispatch, one attempt/outcome, one retry
contract. The scheduler holds none of their economics.

## Fixture mutations made by this certification run

All in Firefly, all on **Pathb Certopp** (`e9965c7c-608e-4f68-a15b-2475374e2ecf`) — never Certhouse:

| Record | Id |
|---|---|
| Enrollment agreement | `9134bf85-e00f-4bc6-8917-a02cda58395f` |
| Schedule assignment | `e67c62b7-fcae-4aca-858f-87f03067e10e` |
| Child placement | `a24a882e-7372-4576-8dbb-4a06020b9224` |

**The specimen has NO accepted tuition term, so it is financially inert** — it holds no billable
assignment, produces no canonical Billing Period, and cannot be billed by automation. It did not
appear in the first wake's evaluation (2 assignments considered, both Certhouse).

## Where the specimen stopped, precisely

Tuition resolution needs `attendanceType`. Program and location resolved from the placement
(`committed_placement`) and days from the schedule (`committed_schedule`), but `attendanceType`
comes only from an operational assignment created through the registered `schedule.create` action.
The `POST /api/admin/schedule-assignments` route used earlier created an operational schedule
*without* that fact, and `POST /api/admin/scheduling` then refuses:

> 409 — "Child already has an operational schedule; use a change command to supersede"

**No `schedule.change` action is registered** — `schedule.create` is the only `schedule.*` action in
the registry. So the specimen cannot currently be advanced to a priceable state through a governed
path, and the remaining live proofs (§13, §15–§20) could not be run on it.

This is a Scheduling/Enrollment gap, not a Financials one, and it is carried as
`SPECIMEN_PRICEABLE_ASSIGNMENT_PATH_GAP`.
