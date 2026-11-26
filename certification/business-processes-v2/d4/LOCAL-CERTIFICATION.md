# BP V2 D4: financial detail site-scope authorization (local certification)

| | |
|---|---|
| Base | lane `2e2d3639b` = staging `91ee6721b` + D1 evidence |
| Stack | shared local certification stack (`alloy-cert`), Northwind org `…0001` |
| Original hosted defect | `qar_58463703cedd`: Restricted Operator (QA North) → `GET /api/admin/financials/charge/{id}` and `/card` → **200 with amounts** for a household every Billing view withholds |
| Not hosted evidence | Hosted proof is recorded separately |

## Root cause

- **One rule, applied in only half the places.** `financialWorkLocation.ts` owns Financials site visibility (`resolveFinancialWorkLocation` + `isFinancialWorkVisible`):
  - an agreement-sourced money row belongs to its agreement's site;
  - a household-sourced row is org-scoped and visible only to org-wide actors.
- **Where it was applied.** Every LIST reader applied it before reading money: position, work queue, payment flow, activity, subjects, account due positions, Billing projections.
- **Where it was missing.** No DETAIL read did. All 31 GET detail and config routes under `/api/admin/financials/*` stopped at org + `fin.read` (traced through their services; none is scoped anywhere on its path).
- **The bypass behind the card route.** The Focus Panel's first paint does not call `/card` at all. Its producer (`focusPanelCardProducers.ts`) calls `buildFinancialsCardVM` after `fin.read` only, so a route-only fix would have left the panel leaking.
- **Why D4 happened.** The list asked "which money may this actor see" and the detail asked only "is this money in the actor's org".

## Affected read surfaces (classification)

| Class | Entry points | Repair |
|---|---|---|
| A: one item, keyed by id | `charge/[id]`, `ledger/[id]`, `eligible-target-charges` (payment), `collection-state` (attempt) | item grain |
| A: one household's presentation | `card`, **Focus Panel producer** (also Billing's source-focused card), `payment-methods`, `autopay`, `responsibility-arrangement`, `responsibility-positions`, `family-discount-position`, `assignable-discounts`, `proposed-charge-discounts`, `reduction-forecast` (opportunity child) | household grain |
| A: org-wide lists and aggregates, not detail | `needs-recognition`, `ledger` list, `journal-entries` list, `snapshot`, `statements` | **residual**, not in D4 |
| D: household roster, no money | `responsibility-candidates`, `responsibility-scopes`, `billing-periods` | CRM reachability; unchanged |
| C: org configuration, no household money | `funding-sources`, `payments-health`, `periodic-billing-status`, `provider`, `tuition-plans`, `accounts`, `accounts/[id]`, `accounting-calendar`, `accepted-payment-methods`, `gl-mappings` | n/a |

The Billing Business Process panel makes no direct `/api/admin/financials/*` call. Its projections were already site-scoped (`billingProjections.ts` → `readAccountDuePositions`). Its record surface is the Focus Panel producer, which is now guarded.

## Repair

- **`web/lib/financials/workspace/financialReadScope.ts` (new; no new rule).** It locates the requested thing exactly as the lists do, then asks `isFinancialWorkVisible` with `activeSiteLocationId: null`.
  - **Item grain:** visible when its own location is visible.
  - **Household grain:** visible to a site-restricted actor only when **every** location the household's money occupies is visible: each agreement's site, plus the org-scoped household account if any charge or payment is household-sourced. These presentations total across the account, so they are refused whole rather than shown with a leaked subtotal.
  - **Unrestricted actors:** answered with **no read**.
  - **Failure handling:** fails closed (read error, broken agreement, null source).
  - **Forged keys:** a child that is not in the named household → `missing`.
  - **`job` sources:** `not_governed` (outside the contract; previous authorization unchanged).
- **`financialReadScopeGuard.ts` (new).** The route-layer form: it takes scope from the server-side access context and answers 404, the same as not-found. `charge/[id]` keeps its own `{ ok:false, error:"No such charge." }` body, identical to the cross-org answer.
- **Call sites.**
  - 13 routes: two lines each. `card` adds the scope step beside `fin.read`; `ledger/[id]` decides from the row it already read.
  - The producer: scope runs after the `fin.read` gate inside the same settled branch, so a refusal is the existing `forbidden` state, with no data.
- **Unchanged.** No grant, capability, migration, financial calculation, writer, payment, subsidy, responsibility or accounting semantic was changed.

## Security matrix (live: `web/tests/financials/live/financialDetailSiteScope.live.test.ts`, 7/7)

**What is real:** the route handlers and the production access chain, i.e. portal admission, the grant resolver, and `resolveAdminAccessCore` reading real `user_access_profiles` / `user_site_access` rows.
**What is mocked:** only *who is signed in*.
**Actors** (created, then removed; 0 rows remain):

| Actor | Role | Scope |
|---|---|---|
| all | `admin` | all sites |
| river | `admin` | Riverside only |
| lake | `admin` | Lakeside only |
| nofin | `mcert_proc_portal_only` | portal, no `fin.read` |

**Records** (Northwind, read-only):
- **H_MIXED:** Riverside agreements (343 charges), a Lakeside agreement, and 38 household-sourced charges.
- **H_LAKE:** one Lakeside agreement and its charge.

| Case | all | river | lake | Before fix |
|---|---|---|---|---|
| charge: Riverside agreement charge (H_MIXED) | 200 | **200** | 404 | lake 200 |
| charge: household-sourced (H_MIXED) | 200 | 404 | n/a | river 200 |
| charge: Lakeside (H_LAKE) | 200 | 404 | **200** | river 200 |
| card H_MIXED | 200 | 404 (also by child) | 404 | 200 / 200 |
| card H_LAKE | n/a | 404 | **200** (also by child) | river 200 |
| card H_LAKE + child of H_MIXED (forged) | n/a | n/a | 404 | 200 |
| producer H_MIXED | ready | **forbidden**, no data | **forbidden** | ready |
| producer H_LAKE | n/a | n/a | ready | n/a |
| payment-methods / responsibility-positions / family-discount-position, H_MIXED | 200 | 404 | 404 | n/a |
| eligible-target-charges: payment at a third site | 200 | 404 | 404 | n/a |
| eligible-target-charges: household-sourced payment | 200 | 404 | 404 | n/a |
| collection-state: Lakeside attempt | 200 | 404 | **200** | n/a |
| cross-org charge id | 404, body identical to an unknown id | | | |
| no `fin.read`: charge, card | 403 | | | |

- **No leakage.** Refused bodies contain no charge id, amount, household name or household id (asserted).
- **List/detail parity.** The position list shows the Riverside actor only Riverside rows, and the detail decision refuses exactly the org-scoped and Lakeside items.
- **Counterfactual.** The same suite on the base routes fails 4 of 7 (charge detail, card, producer, household/item routes), with every out-of-scope read answering **200** (`live-evidence-without-fix.json`).

## Regression

- **Unit tests:** `web/tests/financials/financialReadScope.test.ts`, 18/18.
- **Covering suites:** 414 suites, head vs base (Financials, Focus Panel, Business Processes, Access, plus every test naming a changed route).

| Tree | Passed | Failed |
|---|---|---|
| head | 5712 | 63 |
| base | 5718 | 57 |

- **7 new failures, all repaired as test updates in this change.**
  - `financialsCardGateOrdering` (6): the test did not mock the access context the route now reads. It now models the org-wide actor it always meant, plus a new restricted case → 404.
  - `financialsGateConcurrency` (1): the producer branch is now gate → scope → build, 3 awaits, still one chain inside `allSettled`.
  - After the update: 45/45 in those files.
- **The other 56 failures:** identical on base and pre-existing.
- **Fixed on head:** 1, but environment-dependent (`roleKeyIntegrityAndGrantReplacement` M21) and unrelated.

**Gates.**
- `npm run prebuild`: exit 0 (module imports, service-client principal, unauthenticated side effects, route capabilities, runtime audience, governed docs).
- Lint: 0 errors.
- Type check: scoped `tsc` passed for the shared module, the guard and 5 routes. The other batches were killed by the lane watchdog (exit 144); CI's Production and Full graph type checks are the authority for those.
