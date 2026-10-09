# W7 staging baseline — the plan, and why it has not been executed yet

**Status: NOT EXECUTED.** Two things stand between this branch and an intentional staging baseline,
and neither is a product question:

1. **No governed run can be filed from this session.** Its run (`erun2_99adddf714deb144`) is not in
   the canonical execution-run store, so `database.read_census`, the migration apply, push, PR and
   merge are all refused with `run_not_found` before reaching a person. Recorded as an evidence
   limitation, per the Director (decision 10).
2. **The baseline needs the deployed build.** `invoice_timing` and `billable_on_strategy =
   'billing_policy'` do not exist on staging until migration `20261121120000` is applied and this
   branch is deployed.

Nothing on staging has been mutated, and nothing will be mutated on guessed rows.

## Order of operations once a governed run exists

1. **Census before anything** — file `certification/financials/w7-config/billing-config-census.sql`
   (read-only, one statement, seven questions). It answers, from the deployed primary:
   - every `financial_policies` row the resolver chooses from (q1);
   - every charge template's date strategies (q2);
   - every November 2026 charge with its bound period and gate — **the Nov 5 trace** (q3);
   - how many bound charges sit outside their own service date's period, by writer and status (q4)
     — the historical-mismatch census the Director asked for, reported and **not** normalised;
   - persisted periods by cadence and scope (q5); the accounting calendar (q6); tenancy (q7).
2. **Reconcile** q1/q2/q3 against the code-path trace in the delivery report. The expected Nov 5
   cause: a template on `next_billing_cycle` (Dec 1 invoice) bound by `billable_on`, and a
   `due_date` row of `days_after_invoice` / 10. If staging says otherwise, the report is corrected
   before anything else happens.
3. **Promote** this branch (migration rides the product candidate) and confirm the deployed SHA via
   `/api/build-info`.
4. **Configure the baseline THROUGH THE PRODUCT** (Organization → Financials → Policies → Billing &
   payment timing), as the Director's operator, exactly as the mounted spec did on certification:

   | Rule | Organization default |
   |---|---|
   | Billing period | Monthly · 1st → last day of each month |
   | Invoice timing | 7 days before the billing period begins |
   | Payment due | On the first day of the billing period |
   | Posting review | No review required |

5. **Clear the clutter the census names** — through the same page, never by SQL:
   - location `billing_calendar` overrides that exist only from QA runs → *Return to organization
     default* (retires them; history keeps them);
   - scheduled versions nobody intends → *Cancel scheduled change*;
   - account-scoped calendars on **multi-location** households stay — they are required, the
     binder refuses those households without one — and are reported by count;
   - W7 charge templates repointed to *Follows the organisation's invoice timing* unless a template
     genuinely bills differently (each exception named in the report).
6. **Accounting calendar** — confirm an active calendar with an OPEN period covering Oct 2026 –
   Jan 2027; record its style and open/closed periods (q6).
7. **Re-census** with a second artifact (a census dedupes within a run on the query's hash) and
   record the exact active rows as the W7 baseline.

## What the certification stack already proved (no staging involved)

- `web/tests/financials/live/w7BillingDateChain.live.test.ts` — Nov 5 created Oct 8 / created Nov 5 /
  "next cycle" template / generated November tuition, re-read from Postgres; journal period 2026-11.
- `certification/playwright/w7-billing-timing.cert.spec.ts` — the baseline configured through the
  page; a scheduled change shown and cancelled; Add Charge previewing November · Oct 25 · Nov 1 ·
  "Draft until Nov 1, 2026" without committing. Screenshots beside this file.
