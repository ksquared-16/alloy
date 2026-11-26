# W7 Repair Batch 1 — Phase 0 diagnosis

Read-only. Nothing was mutated; no Alvarez row was touched.

Deployed at census: `ea596e6152358d1d2be80f676955f2f8a3ae39be`.

## W7 QA state — what is actually recorded

The store (`qa_director_acceptance_results`, suite `core_financials_director_qa`) holds **one real
Director submission**, not two:

| field | value |
|---|---|
| scenario_key | `add_charge_honours_review_boundary` |
| result | **fail** |
| classification | `PRODUCT_DEFECT` |
| tester | kelly.kurzman@gmail.com |
| scenario_definition_version | `2026-09-30.1` |
| deployed_revision | `ea596e6152358d1d2be80f676955f2f8a3ae39be` |
| completed_at | 2026-10-01 17:25:54 UTC |
| observation | "Failed -> add charge service date not properly setup. After adding charge the acocunts screen doesn't load (blank) screen." |
| expected_result | "service date should include a date picker, change the date icon to fit the alloy branding guide." |

The other three rows are harness-certification entries (`qa-slot1-product@example.com`, result
`not_run`), two of them against older revisions. They are not Director acceptances.

**A defect in that note is not in the seven enumerated findings:** *"After adding charge the
accounts screen doesn't load (blank) screen."* A blank Accounts surface after a successful write is
more serious than the picker complaint it is recorded beside.

### How a deploy affects these records

By design, not by accident. The reader scopes results to the **current** `deployed_revision`:

> *"An acceptance is testimony about the build it was given. Reading across revisions would let
> yesterday's ticks vouch for code nobody has looked at… Earlier builds' answers stay in the table
> and stay legible; they simply do not count as this build's."*

So after any repair deploy the row persists and is surfaced as prior-revision testimony; it stops
counting as acceptance of the new build. That matches "do not mark repaired scenarios PASS
automatically" — the Director re-runs and decides.

## Finding 2 — the two Field trip rows are NOT a duplicate

Five charges carry `description = 'field_trip'`, all $40.00, all `charge_type = fee`. Exactly
**one** was written during the QA session:

- `2026-10-01 17:24:37` · `enrollment_agreement` grain · created_by `b2562c99` — 77 seconds before
  the Director submitted the scenario at 17:25:54.

The others predate 2026-09-30. The pair observed on screen is one `enrollment_agreement`-grain
charge (projected as the child, "Ana Alvarez") and one `customer`-grain charge (projected as
"Household") — two distinct canonical charges at two different grains, created at different times.

**One submission produced one charge.** No duplication, no read-model double projection, and
nothing to reverse. The grain difference is why they read as "two Field trips".

## Finding 3 — responsibility was NEVER PERSISTED (cause B)

The newest row in `financial_responsibility_allocations` is **2026-09-25 23:18**. The QA charge was
created **2026-10-01 17:24:37**. No allocation exists for it.

The ledger's "Not allocated" is therefore **truthful**: canonically, that charge has no
responsibility. The contradiction is upstream, in what the preview promised.

The chain explains it. Two different functions share the name `resolveChargeResponsibility`:

- `lib/financials/chargeResolution/responsibility.ts` — **pure**, computes a projected split for
  the Add Charge preview.
- `lib/financials/responsibility/responsibilityService.ts` — the one that **INSERTs** allocations
  (`.from("financial_responsibility_allocations").insert(rows)`), and it is called from
  `financialResponsibilityActions.ts`, the separate **"Resolve who owes"** operator action.

Add Charge calls the first and never the second. So posting creates the charge and no allocation,
and the ledger row carries the explicit action *"Resolve who owes … divide it under the arrangement
in force"* — the step that would write it.

**This is a product decision, not a label bug.** Either Add Charge persists the responsibility it
previewed, or the preview stops promising a split that posting will not create. Per the
instruction, the label was not touched: canonical money truth now says unallocated, and the screen
agrees with it.

## Finding 5 — the blank Discounts drawer, root cause

`FinancialsDiscountPanel` renders two different surfaces. Opened from the gear it is mounted with
`hostedOpen`, which sets `manageOpen = true` and renders the **manage** surface — and that surface
renders only `childRows.map(...)`.

`childRows` is built by iterating **policies** → `p.subjects`. So:

- no configured policies → no rows → **blank**;
- still loading → the `loading` branch lives only in the inline summary, which hosted mode skips → **blank**;
- read failed → same, the `error` branch is also inline-only → **blank**.

Three distinct paths to an empty body with nothing but Close. The per-child "No discount" state
exists, but there is no state for *no children at all*, and no hosted loading or error state. The
mount supplies `customerId` correctly — `discountAdmin` is wired — so the engine being empty is not
the cause; the surface simply has no way to say so.

Separately, `FinancialsDetailCard` destructures and types a `discountAdmin` prop that it **never
renders** — accepted and dropped. Not the cause of this blank (the overlay renders the panel
directly), but dead contract worth removing.

## Provenance authority — what can be answered truthfully

`charges` carries `created_by`, `created_at`, `posted_by`, `posted_at`, `updated_by`, `updated_at`,
`job_id`, `schedule_id`, `subscription_id`, `charge_template_id`, `source_charge_id`, `metadata`.

So Finding 1's "CREATED BY" is answerable without fabrication: a human id where one exists
(`b2562c99`, `a92a0f18`, `94950d52` all appear), and honest system provenance where it does not —
the two 2026-09-29 tuition charges have `created_by = None` with scheduling columns available to
name them as generated rather than inventing an actor.

**No provenance gap blocks Finding 1.**
