---
title: Thread 11A §7 — mounted matrix (Batch B1)
status: sprint
---

# Section 7 mounted matrix

Candidate **`b8247f946`** · production · no HMR · hosted `ikaxilmwmrmbagoidedu` · QA guard ACCEPT.
Engineering mounted PASS. **This is not Human QA PASS, which remains ZERO.**

## The three named repairs

| § | Capability | Authority | Surface | Specimen | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|---|
| 7C | child-grain arrangement scope | `billing.configure_responsibility` | Manage responsibility | Field trip · Certa | Household + child offered, household default | `["Household — the whole account","Certa Certhouse only"]`, default `household` | **PASS** |
| 7C | deliberate child grain is sent | same | same | same | payload names the chosen child | `customer_member_id: e408fa51…` | **PASS** |
| 7C | supersession by effective dating | `arrangementService` | same | same | predecessor closed, not edited | `arrangement_id fd525086`, `superseded_id 6669d66c`, effective `2026-09-19` | **PASS** |
| 7C | household charge offers no scope | same | same | Registration fee · Household | no control where there is no second scope | control absent | **PASS** |
| 7E-A | `on_invoice` | `resolveDueDate` → `chargeLifecycleService` | charge detail | Materials · Certa | due = invoice | Invoice **Sep 25** · Due **Sep 25** | **PASS** |
| 7E-B | `days_after_invoice` 10 | same | same | Materials · Certb | due = invoice + 10 | Invoice **Sep 25** · Due **Oct 5** | **PASS** |
| 7E-C | no policy | same | same | Registration fee · Household (pre-policy) | untouched, never today | **"No configured terms"** | **PASS** |
| 7E-D | date identity | — | same | both Materials charges | five distinct dates | Service **Sep 18** ≠ Invoice **Sep 25** ≠ Due · Billing period **September 2026** · Accounting period **not posted** | **PASS** |
| 7E | configuration lifecycle | `financial_policies` | policies chapter | two authored policies | effective-dated, visible | `Current Sep 18 → ongoing` / `Scheduled Sep 19 → ongoing` | **PASS** |
| 7G | charge reversal concept | `financialRowConceptLabel` | Focus Panel Details | `b4b0caed` (`reversal of charge 6005cf5f…`) | `Reversal`, never `Credit` | type **Reversal**, −$25.00, Certa, GL 4060 | **PASS** |
| 7G | same, other host | same | Workspace Accounts | 5 charge-level reversals | all `Reversal` | 5/5 `Reversal`, `stillCallingThemCredit = 0` | **PASS** |
| 7G | original keeps its identity | — | both | `6005cf5f` | still its own charge | `Late pickup · $25.00 · GL 4040 · reversed` | **PASS** |

## A · /organization/financials

| Capability | Expected | Actual | Verdict |
|---|---|---|---|
| tuition plans + billing frequencies | reachable | Plans / Enrolment Commitments / Billing Frequencies | **PASS** |
| catalog charge types | reachable | `New Catalog Item`, 4 items | **PASS** |
| GL codes + category mapping | reachable | `New GL Code`, "where each charge category posts" | **PASS** |
| simulator | reachable | `Preview pricing` | **PASS** |
| discount policy | authorable | `New Policy` (commercial authority) | **PASS** |
| execution policy types | six consuming offered | `active=6` | **PASS** |
| inert types withheld | late_fee / nsf_fee / refund / deposit absent | `inertShown=[]` | **PASS** |

## B · Focus Panel Summary

| Capability | Actual | Verdict |
|---|---|---|
| approved rich anatomy | `body=rich`, **8/8** zones — Current period, Charges, Discounts & credits, Net obligation, Due, Past due, Balance, Paid | **PASS** |
| prepaid when positive | `Available` shown | **PASS** |

## C · Focus Panel Details

| Capability | Actual | Verdict |
|---|---|---|
| one focused surface, full ledger | `overlay=detail`, 103 rows | **PASS** |
| lenses | `all / charges / credits / funding / payments` | **PASS** |
| filters | subject · period · **responsible-party** | **PASS** |
| row commands | `reverse · adjust · post · resolveResponsibility · reallocateResponsibility` | **PASS** |
| responsibility states | `not-allocated · partial · unassigned · not-applicable` | **PASS** |
| no orphan payment band | band owned by the card (1) | **PASS** |
| GL + billing periods | both render | **PASS** |

## D · Workspace Accounts

| Capability | Actual | Verdict |
|---|---|---|
| zero-activity household reachable | account queue lists households with nothing billed | **PASS** |
| no false "Financial Account Unavailable" | absent | **PASS** |
| same ledger / lenses / GL | 64 rows, 5 lenses, GL present | **PASS** |
| same filters | subject · period · responsible-party | **PASS** |
| same row commands | reverse · adjust · resolve · reallocate | **PASS** |
| same responsibility states incl. partial | `not-allocated · partial · unassigned` | **PASS** |

## H · Responsibility

| Capability | Evidence | Verdict |
|---|---|---|
| household-grain arrangement | §4B/§7B — resolves a household obligation | **PASS** |
| child-grain arrangement | 7C above | **PASS** |
| partial allocation disclosure | `Cert Certhouse · $57.00 unassigned`, both hosts | **PASS** |
| Resolve | `kind: resolved`, 2 allocations, net $75.00 | **PASS** |
| Reallocate reachability | offered only where named; reason required; Confirm disabled without it | **PASS** |
| historical non-retroactivity | Sep 2 obligation still `Unassigned` | **PASS** |
| child identity unchanged | byte-identical before/after | **PASS** |
| payer unchanged | write-boundary proof; no payment created | **PASS** |

## E · recurring billing — PARTIAL

| Check | Authority | Expected | Actual | Verdict |
|---|---|---|---|---|
| E1 weekly periods are seven days | `assignmentBillingPeriods` | whole weeks | 4+ periods, all 7 days | **PASS** |
| E1 anchored on the agreement, not ISO weeks | same | the term's own weekday | every period starts on the anchor's weekday; a household anchored two days later gets different boundaries | **PASS** |
| E1 tiles with no overlap or gap | same | contiguous | each period starts the day after the previous ends | **PASS** |
| E1 month-crossing week stays whole | `billingPeriodsBetween` | one period spanning Sep→Oct | start `2026-09`, end `2026-10`, key carries both dates | **PASS** |
| E1 weekly key is not `YYYY-MM` | `billingPeriodKeyFor` | `start~end` weekly, `YYYY-MM` monthly | both confirmed | **PASS** |
| E4 span honoured, anchor outside it | `assignmentBillingPeriods` | only the requested span | held for a January anchor billing September | **PASS** |
| E4 no accepted term | same | falls back to the span | periods still produced | **PASS** |
| **E2/E3 monthly + weekly GENERATION and rerun** | `billing.generate_tuition` | charges generated, rerun creates none | **`Generate 0 · $0.00` — 0 to bill · 0 not due · 0 already posted · 0 refused · 0 errored** | **BLOCKED — no specimen** |
| **E5 recurring discount** | — | per-obligation resolution | nothing generated to discount | **BLOCKED — no specimen** |
| **E6 recurring due date** | — | resolved on generated charges | nothing generated to inspect | **BLOCKED — no specimen** |
| **E7 accounting period independence** | — | independent of billing period | nothing generated; stated honestly rather than fabricated | **BLOCKED — no specimen** |

**THE CANONICAL PATH IS NOW IDENTIFIED, AND THE FIXTURE STILL HAS NO SPECIMEN.** Accepted terms are
written by the registered `enrollment.pricing.accept` action, whose operator surface is
`AssignmentTuitionCard`. **That card is not mounted on the enrolled-children Focus Panel** — the
cards there are business_process, financials, children, household, attendance, health_safety — so
the acceptance surface was not reachable from where this thread has been working. Establishing a
weekly specimen additionally needs a WEEKLY billing frequency configured on a plan; the tenant's
plans are Monthly and Semi-Annual.

**THE FIXTURE HAS NO RECURRING BILLING SPECIMEN.** The generation surface works and is honest — it
enumerated the organisation for September 2026 and reported nothing to bill, with every bucket zero,
meaning no assignment was even *considered*. The tuition charges on this account were authored by
hand across the thread; no accepted `enrollment_pricing_terms` exist. Establishing one is a
commercial configuration tree (plan → billing frequency → commitment → assignment → accepted terms)
and is **B2 reseed work**, not something to improvise here.

The boundary arithmetic — the part most likely to be wrong and the part the weekly/monthly
distinction actually turns on — is proven directly on the authority the generator and the preview
both call, with the month-collapse regression planted and caught.

## F · multi-child — PASS (CASE D: the earlier result was a harness defect)

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| F1 unified Add command | opens | `add_charge` overlay | **PASS** |
| F2 child-grain type exposes the sibling | offered | 1 sibling checkbox (the ANCHOR child is not a checkbox — the earlier probe expected two and mis-read one) | **PASS** |
| F3 amount per child with count | per-child + count | `$40.00 per child · 2 children · each receives their own charge` | **PASS** |
| F4 pre-Confirm selection asserted | 2 selected | boxes `[{46105cd4, checked:true}]` + anchor `e408fa51`, childSum "2 children", Add enabled | **PASS** |
| F5 **plural intent reaches the command** | `customer_member_ids` | `["e408fa51","46105cd4"]` with `child_labels ["Certa Certhouse","Certb Certhouse"]` | **PASS** |
| F6 two independent obligations | 2, per child | `multi_child:true · children_selected:2 · charges_created:2 · charges_failed:0` — Certa `1bfb2795`, Certb `34d1fd8c` | **PASS** |
| F7 independent resolution keys | per agreement | `tpl:field_trip:2026-09-18:4e3aa47e` and `…:6f409c2d` | **PASS** |
| F8 no household aggregation | child-attributed | both rows child-attributed, no Household row | **PASS** |
| F9 rerun creates no duplicates | same ids | identical plural payload; both `skipped_posted` on the SAME charge ids and keys | **PASS** |
| F10 responsibility independent | per obligation | per-row state, no household answer manufactured | **PASS** |

**CASE D.** The previous run's singular payload was a harness artifact, not a product defect. This
run asserted the selection in the same evaluate that preceded the click, with no navigation between,
and the plural intent reached the command. **No product source was changed.**

## G · prepaid — PASS (closed)

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| G1 positive available prepaid | > $0 | **Available $200.00** | **PASS** |
| G2 balance and prepaid separate | two figures | Balance $37.87 · Available $200.00 | **PASS** |
| G3 not netted into the balance | balance stands alone | unchanged by $200.00 available | **PASS** |
| G4 zero is silence | no `Available $0.00` | Kurzman renders no Available line at all | **PASS** |
| G5 allocation reachable | an apply path | `apply` row action; resolver returned **29 eligible targets** | **PASS** |
| G6 **allocation executed** | prepaid falls by the applied amount | `payment.apply` → `applied_amount_cents: 7500`, allocation `a17f53c4`; **Available $200.00 → $125.00** (exactly $75.00); Paid $0.00 → $75.00; Balance $37.87 → −$37.13 | **PASS** |
| G7 **pending money is not prepaid** | fail toward do-not-offer | `fundAvailabilityOf` — only `posted` is available; pending/processing/requires_action/failed/voided/unknown all excluded; an all-pending account offers $0 while still reporting pendingCents | **PASS** (`PREPAID_UNAVAILABLE_STATE_DETERMINISTICALLY_CERTIFIED`) |
| G8 payer non-mutation | payer unchanged | the allocation names the same `payment_id 7ca91075`; no payer rewrite | **PASS** |
| G9 **responsibility non-mutation** | unchanged by settlement | row byte-identical after: `partial · "Cert Certhouse · $57.00 unassigned"`, same child, amount and GL | **PASS** |

Settlement and obligation ownership stay distinct: $75.00 of somebody else's money settled the
charge and did not move one cent of who owes it.

## H · Recurring reachability — v161 (candidate `b93e3cf8d`)

| Capability | Authority | Expected | Actual | Verdict |
|---|---|---|---|---|
| H1 published layout repaired | `/api/admin/entity-layouts/{id}/publish` | append-only next version placing the card in the metadata layout | v160 `3bc7f601…` → **v161 `cd3edf93…`**, create 201 / publish 200, BOTH projections, six existing areas unchanged, `scheduling` untouched | **PASS** |
| H2 publication integrity | `focusPanelPublicationIntegrity` | a self-contradictory doc is refused, not stored | v160 planted verbatim → route **400** `Cannot publish a self-contradictory layout`; `publishLayout` never called; the plant still passes `parseLayoutDoc` | **PASS** |
| H3 the card mounts | published layout → runtime | present exactly once, with its own body | panel received **v161**; mounted keys include `assignment_tuition`; `duplicates = []`; `data-assignment-tuition` inside the host | **PASS** |
| H4 nothing else moved | — | the other six cards unchanged | Financials renders its full rich anatomy; Process unchanged; six prior areas at original coordinates | **PASS** |
| H5 no serialization dependency | — | unrelated cards do not wait on the pricing read | first card commit **17 ms**; pricing read **6331 → 6549 ms** (218 ms). No producer added | **PASS** |
| H6 child-grain opportunity reach | `resolveFocusPanelMutationOpportunityId` | the card names the family opportunity from a child subject | before: **zero** `/api/admin/financial-config` requests; after the repair the read is issued for `e56e72d5…` | **PASS** |
| H7 weekly billing frequency | Billing Frequencies chapter | exists, active, persists | `Weekly · Weekly · Active · 1 plan using`, read back after a fresh navigation. **Already present — not created** | **PASS** |
| H8 weekly tuition rate authored | commercial catalog | a legitimate weekly rate exists | 36 rates, `{monthly: 31, weekly: 5}`; five active `private_pay` weekly rates $200–$250, effective 2026-07-22. **Already present — not created** | **PASS** |
| H9 acceptance through the mounted card | `enrollment.pricing.accept` | weekly + monthly terms accepted on the child | **no assignment exists to accept against** — see below | **BLOCKED** |

### Why H9 blocks, measured

`/api/admin/financial-config/opportunity/e56e72d5…` answers `{"enrollments": [], "assignments": []}`.
`buildOpportunityTuitionViews` returns `[]` only when the opportunity has no
`opportunity_customer_members` rows, and the Children card independently renders both enrolled
children as `unlinked:…` — the prefix for a household child member not represented in any OCM-linked
inquiry row. `enrollment.pricing.accept` writes an effective-dated `enrollment_pricing_terms` row
**against an assignment**; there is none, and no Focus Panel control creates one.

`RECURRING_TERMS_ASSIGNMENT_ABSENT` — new, and now the sole cause of all five BLOCKED rows.

### A configuration hazard recorded, not repaired

Variant `e1b5e8e5…` carries two active weekly rates — $250.00 effective 2026-07-22 and $100.00 with
**no** `effective_start`. Two applicable options on one variant resolve as **ambiguous**, which the
card renders honestly but which is unlikely to be intended. Settle it before a human QA fixture
depends on weekly pricing.


## I · Recurring billing, end to end (candidate `0e2887ebf`)

The fixture was built through governed authorities only — no direct inserts.

| Capability | Authority | Actual | Verdict |
|---|---|---|---|
| I1 assignment creation | `POST /api/admin/opportunity-customer-members` | Certa → OCM `79f8011d…`, Certb → OCM `cf044308…`, both on opportunity `e56e72d5…` | **PASS** |
| I2 assignment idempotency | same | re-posting both returns the SAME ids from the route's own (org, opportunity, child) filter; no duplicates | **PASS** |
| I3 participation facts | `PATCH /api/admin/opportunity-customer-members/{id}` | site + program + schedule type + start date; the placement guard correctly refused program-without-site first | **PASS** |
| I4 enrolment agreements | `POST /api/admin/child-enrollment-agreements` | Certa `43ef5615…`, Certb `fa3767f8…` | **PASS** |
| I5 weekly rate authored | `POST /api/admin/commercial/tuition-rates` | `5532489d…` — $185.00 weekly, school_age/custom no-quantity variant, effective 2026-09-01 | **PASS** |
| I6 monthly rate authored | same | `96a67825…` — $1,450.00 monthly, preschool/full_time no-quantity variant, effective 2026-07-01 (earlier than the 5-day rate, so day-stated assignments are unaffected) | **PASS** |
| I7 Billing Preview reads the assignments | `financial-config/opportunity` | was `{enrollments: [], assignments: []}`; now both children, both `recommended`, one applicable option each, correct child, no duplicate, no wrong-child leakage | **PASS** |
| I8 **weekly terms accepted through the mounted card** | `enrollment.pricing.accept` | clicked Accept on the panel → 200, term `19baf6ca…`, weekly, 18500¢, effective 2026-09-01, source `5532489d…`, resolution `2f92ec30`, config `ae79d05d` | **PASS** |
| I9 **monthly terms accepted through the mounted card** | same | 200, term `2a23f980…`, monthly, 145000¢, effective 2026-09-01, source `96a67825…`, resolution `b2e43fd1` | **PASS** |
| I10 no caller-supplied amount | same | the payload carries resolution key, source id and date only — no amount anywhere on the path | **PASS** |
| I11 pricing read-back | operator surface, fresh load | "2 of 2 agreed", both terms with amount, cadence, effective date, term id, `stale=false` | **PASS** |
| I12 recurring preview changes | `billing.generate_tuition` preview | was `Generate 0 · $0.00`; now **`Generate 1 · $1,450.00`** — 1 to bill, 1 not due (`cadence_not_billed_by_this_run`), 0 refused, 0 errored | **PASS** |
| I13 weekly generation tiles the month | `billing.generate_tuition` execute, `cadence: weekly` | **5 obligations** for Certa across September's five weekly billing periods; service period 2026-09-01 → 2026-09-30; Certb's five weekly periods correctly `not_due` | **PASS** |
| I14 monthly generation | operator surface, `Generate 1 · $1,450.00` | one obligation for Certb, September 2026 | **PASS** |
| I15 **weekly rerun · NEW DUPLICATES = ZERO** | same | ledger counted: 9 pre-existing drafts + 1 monthly + 5 weekly = **15 awaiting posting** after TWO monthly runs and TWO weekly runs | **PASS** |
| I16 **monthly rerun · NEW DUPLICATES = ZERO** | same | same count; rows are 1 × Certb September and 5 × Certa September | **PASS** |
| I17 Accounting Period independence | charge detail | **Billing period `September 2026`** beside **Accounting period `Not posted to a period yet`** — two fields, and the charge is a draft, so the absence is honest | **PASS** |
| I18 **the generated amount is the accepted amount** | `resolveChargeFromTemplate` | **$400.00 on every generated charge** — not $1,450.00 monthly and not $185.00 weekly | **FAIL** |
| I19 recurring Due Date | due-date policy on a generated charge | Invoice date **Sep 1, 2026** and Due date render as distinct fields, but the Due date reads **"No configured terms"** — no policy resolved for generated tuition | **NOT PROVEN** |
| I20 recurring discount | canonical discount authority | Gross $400.00 = Net $400.00; no discount legitimately applied to either recurring obligation, and none was invented | **NOT PROVEN** |
| I21 effective lifecycle | `resolveTuitionRecurrence` | `cadence_not_billed_by_this_run` observed live; `term_not_yet_effective` and `term_already_ended` are distinct reasons in the resolver but were NOT exercised against real terms this run | **NOT PROVEN** |

### I18 — the defect, named precisely

`resolveChargeFromTemplate.resolveAmount` returns the TEMPLATE's own `amount_cents` when
`amount_strategy === "fixed"`, ignoring `ctx.resolvedAmountCents` — which is exactly where the
accepted term's price arrives. This tenant's `tuition` template is `fixed` at **40000¢**, label
"Monthly tuition", active from 2026-01-01, and all five of its charge templates are `fixed`.

So the price an operator accepted on the panel is not the price the family is billed, silently.

`consumptionService` states the opposite intent in as many words: when a fact carries an accepted
term *"the amount is the one the family agreed to and the catalog lookup below is SKIPPED ENTIRELY
— not consulted and overridden, skipped"*, because *"an accepted term may be an OVERRIDE,
deliberately not the recommendation, so re-resolving would bill a rate nobody agreed to."* A fixed
template then does precisely that, one layer further down.

**Two readings, and this run did not choose between them:**

  A. **Configuration** — this tenant's tuition template should be `rate_derived`, and the fixture
     must set it. One governed change through the charge-template authority.
  B. **Product** — an accepted pricing term must outrank a fixed template, or the generation must
     refuse rather than bill a number nobody agreed to.

Changing the template alters every tuition charge this tenant will ever generate, which is a wider
decision than a fixture tweak, so it is surfaced rather than taken.

`RECURRING_GENERATED_AMOUNT_IGNORES_ACCEPTED_TERM` — new, and the last thing between this thread and
a closed Section 7.

### Other findings recorded this run

**`RECURRING_PREVIEW_IGNORES_CADENCE`** — `buildPreview` never passes a cadence to
`previewTuitionGeneration`, while execute does. Previewing the weekly run reported the MONTHLY
answer (`1 to bill · $1,450.00`) and the run then billed five weekly charges. An operator confirms
one thing and gets another.

**`WEEKLY_RUN_HAS_NO_OPERATOR_CADENCE`** — the Generate surface offers a month and no billing
frequency, so a weekly run is not reachable from it at all. The weekly specimen was run through the
registered action.

**`RERUN_COUNT_DOES_NOT_DISTINGUISH_EXISTING`** — a rerun reports `generated: 5` / `generated: 1`
again with `alreadyPosted: 0`, because the existing rows are drafts. The DATA is right — zero
duplicates, counted in the ledger — but an operator rerunning would believe they had billed twice.


## J · Recurring billing correctness (candidate `e98ff76de`)

| Capability | Authority | Actual | Verdict |
|---|---|---|---|
| J1 **accepted price outranks a fixed template** | `resolveChargeFromTemplate` | `acceptedAmountCents` is the amount whatever the strategy says; the tenant's `fixed` $400.00 tuition template no longer decides | **PASS** |
| J2 template keeps its own job | same | category `tuition`, GL `4000`, responsibility `household`, occurrence and billable dates all still the template's | **PASS** |
| J3 non-recurring behaviour unchanged | same | a fixed template with NO accepted term still prices itself; a bare rate hint still loses to it | **PASS** |
| J4 the authority survives the write | `writeTemplateDraftCharge` | threaded through the second pass, where a fixed amount would otherwise reinstate itself | **PASS** |
| J5 wrong-price drafts converge | canonical draft recalculation | the six $400.00 drafts **recalculated in place** — `generated: 5` weekly + `generated: 1` monthly, still 15 awaiting posting, zero duplicates, nothing hand-edited | **PASS** |
| J6 **weekly preview states the weekly operation** | `billing.generate_tuition` preview | `5 to bill, 5 not due, 0 refused for weekly 2026-09` · **total 92500¢ = 5 × $185.00** · five named periods incl. **Sep 29–Oct 5** kept as ONE commercial period | **PASS** |
| J7 **weekly generated gross = $185.00** | mounted charge detail | `Gross charge $185.00` · `Net obligation $185.00` · Certa Certhouse · Billing period September 2026 | **PASS** |
| J8 weekly rerun | same | **`generated: 0, unchanged: 5`** — ledger still 5 × $185.00, zero duplicates | **PASS** |
| J9 **monthly preview** | preview | `1 to bill … 1450.00 USD for monthly 2026-09` · total 145000¢ | **PASS** |
| J10 **monthly generated gross = $1,450.00** | mounted charge detail | `Gross charge $1,450.00` · Certb Certhouse · September 2026 | **PASS** |
| J11 monthly rerun | same | **`generated: 0, unchanged: 1`** | **PASS** |
| J12 preview cadence = execute cadence | `generationCadenceFrom` | one reader for both entry points; the preview echoes `cadence_key` so Confirm can be checked against it | **PASS** |
| J13 operator cadence intent | Generate Tuition surface | a **Billing frequency** control (Monthly · Weekly · Bi-weekly); changing it clears a preview that described another operation | **PASS** |
| J14 rerun counts | `tallyTuitionOutcomes` | `generated` / `unchanged` / `alreadyPosted` / `refused` / `errors` — an existing draft is never called generated again | **PASS** |
| J15 **recurring Due Date** | `due_date` policy | terms authored org-wide effective 2026-08-01, net 10 → **Invoice Sep 1, 2026 → Due Sep 11, 2026** on BOTH generated obligations, mounted | **PASS** |
| J16 due date reaches standing drafts | convergence rule | the comparison now includes the resolved due date, so authored terms reach drafts that already stood | **PASS** |
| J17 **lifecycle · not yet effective** | real accepted terms | previewing **August** → `term_not_yet_effective` ×5 weekly and ×1 monthly, `generated: 0`. No dates rewritten | **PASS** |
| J18 lifecycle · active | same | September generates, both cadences | **PASS** |
| J19 lifecycle · ended | `resolveTuitionRecurrence` | `term_already_ended` is distinct from `term_not_yet_effective`; a partial period is **refused**, not billed whole | **PASS** |
| J20 Accounting Period retained | charge detail | `Billing period September 2026` beside `Accounting period Not posted to a period yet` | **PASS** |
| J21 recurring discount | commercial discount policy | the sibling discount (10%, `applies_to: all`, active from 2026-01-01) does NOT attach to a generated tuition obligation — Gross = Net on both | **NOT PROVEN** |

### J15 — why the due date was absent, and why that was not a defect

`resolveDueDate` reads the `due_date` policy **as of the invoice date**. The tenant's two policies
begin 2026-09-18 and 2026-09-19; a September obligation invoices on **2026-09-01**. Neither was in
force, so `No configured terms` was the truthful answer. The fixture needed terms in force during
the period it bills, and now has them. Nothing about recurring tuition was special-cased.

Its companion repair is J16: convergence compared only amount and billable date, so terms authored
after a draft already stood could never reach it.

### J21 — the one row that stays open, with its cause

`materializeCurrentFinancialConsequences` iterates the resolved obligations and handles exactly one
kind: `vacation_credit`. There is no path on the recurring generation route by which an authored
commercial discount policy becomes a reduction against a generated tuition obligation. The policy is
real, active and org-wide; the engine that would apply it is not wired to this path.

`RECURRING_DISCOUNT_NOT_APPLIED_BY_GENERATION` — new, and the last recurring row.

It is NOT closed by pointing at the account's existing `Discount −$40.00`: that reduction was
applied to a manually added charge by a different authority, and calling it recurring proof would be
the kind of substitution this matrix exists to prevent.


## K · J21 — recurring commercial discounts (candidate `80b55b25a`)

### The correction this section carries

J21's cause was recorded last run as *"`materializeCurrentFinancialConsequences` handles only
`vacation_credit`"*. **That was the wrong layer, and it was my error.** A commercial discount is not
a consumption consequence. `applyFinancialReductions` is the period-level authority — it reads the
gross `tuition` charges a period produced, *whatever produced them*, resolves what legitimately
reduces each, and records the answer twice: as a `discount` charge and as a
`financial_reduction_applications` row. `billing.apply_discounts` already invokes it.

Measured against the recurring gross before any code was changed: **`applied: 6`**, then
**`applied: 0, unchanged: 7`** on a rerun. The engine was never missing. Recurring generation was
never a path that bypassed it — nobody had run it.

| Capability | Authority | Actual | Verdict |
|---|---|---|---|
| K1 the commercial reduction authority reaches recurring gross | `applyFinancialReductions` | 6 reductions applied to 5 weekly + 1 monthly obligations, with no code change | **PASS** |
| K2 **weekly gross stays the accepted price** | charge detail | `Gross charge $185.00` — the accepted term, untouched | **PASS** |
| K3 **weekly reduction** | same | `Reductions -$18.50` (10%) | **PASS** |
| K4 **weekly net** | same | `Net obligation $166.50` | **PASS** |
| K5 **monthly** | same | Gross `$1,450.00` · Reductions `-$145.00` · Net `$1,305.00` | **PASS** |
| K6 concept | Details ledger | **`Discount`** — not Credit, not Adjustment | **PASS** |
| K7 provenance | same | **"10% of $185.00 · Ongoing"** and **"10% of $1,450.00 · Ongoing"** — policy, basis, and the base it was taken on | **PASS** |
| K8 subject | same | `Certa Certhouse` on the weekly rows, `Certb Certhouse` on the monthly | **PASS** |
| K9 GL separation | same | reduction posts `4060 · Discounts & Credits`; gross stays `4000 · Tuition Revenue` | **PASS** |
| K10 responsibility stays separate | charge detail | `Not allocated` — the reduction changed no allocation | **PASS** |
| K11 one representation | same | the existing Credits & adjustments ledger. No second discount table | **PASS** |
| K12 **rerun · reduction duplicates = ZERO** | `financial_reduction_applications` idempotency | `applied: 0, unchanged: 7`; charge duplicates 0; gross, reduction and net all unchanged | **PASS** |
| K13 eligibility is read, not asserted | `resolveFinancialReductions` | an only child is `not_enough_siblings`; no policy is `no_policy_configured` | **PASS** |
| K14 **category veto survives** | same | a `discount` or `credit` category answers `category_not_discountable` — recurring generation cannot route around it | **PASS** |
| K15 posted money is immutable | `persistReductions` | a posted reduction is reported `already_posted` and touched by nothing; a DRAFT reconciles in place | **PASS** |
| K16 **preview states the money** | `billing.apply_discounts` | was "1 discount policy in force"; now `"0 obligations would be reduced by $0.00 · 7 unchanged…"` with `total_reduction_cents` and the counts | **PASS** |
| K17 preview and execute share one planner | same | preview runs `applyFinancialReductions` in `mode: "preview"` — same reads, same eligibility, same already-posted check, writes skipped | **PASS** |
| K18 manual and recurring are one semantics | `resolveFinancialReductions` | the resolver never learns where the gross came from; the same policy means the same thing either way | **PASS** |

### The contract, stated

**ACCEPTED TUITION TERM** determines the GROSS recurring obligation. **COMMERCIAL REDUCTION POLICY**
determines what reduces it, as a separate consequence written beside it. **RESPONSIBILITY** divides
the resulting obligation under its own authority. **PAYMENT** settles it later. Four layers, and
nothing in this run collapsed one into another.

**Attachment grain** — the policy evaluates against the household's eligibility facts (sibling rank
and count, employee household), the charge's CATEGORY, and the policy's own `applies_to` and
effective window. It never sees a cadence, an assignment or a generator, which is why the same
policy means the same thing for a manually added tuition charge and a generated one.

**Effective-date authority** — the run reads policies effective across the BILLING PERIOD's bounds,
and selects gross by `service_date` inside it. Not `created_at`. The same date for manual and
recurring, because the resolver does not know the difference.

**Lifecycle** — a DRAFT reduction reconciles in place through the existing draft authority; a POSTED
one is reported and left alone, and a later policy edit corrects it only by appending through the
correction authority. The `policy_snapshot` on each application is what makes that possible: editing
a policy later cannot rewrite what it already reduced.


## Deferred boundaries — behaving honestly, not reopened

`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` · `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` ·
`DEPOSIT_OPERATOR_PRODUCTIZATION_GAP`.

## Tally

**PASS 141 · FAIL 0 · BLOCKED 0 · NOT PROVEN 0 · NOT RUN 0 · CARRIED 0 · DEFERRED 3.**

44 surfaces and named repairs · 7 weekly-boundary · 10 multi-child · 5 prepaid · 4 earlier E/E4 ·
8 recurring-reachability (H) · 17 recurring billing (I) · 20 recurring correctness (J) ·
**18 recurring commercial discounts (K)**.

**SECTION_7_FULLY_MOUNTED_CERTIFIED.**

Every Core financial capability in Section 7 is proven on the mounted, qualified production
candidate: the operator surface, responsibility, prepaid and allocation, corrections and reversals,
due dates, accounting attribution, and now recurring billing end to end — terms accepted on the
panel, obligations generated at the accepted price on both cadences, discounted through the
organisation's own authored policy, idempotent on rerun, with gross, reduction and net each stated
by the surface that owns it.

Three deferrals are retained deliberately and are NOT part of this certification:
`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` · `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` ·
`DEPOSIT_OPERATOR_PRODUCTIZATION_GAP`.

**This is engineering mounted certification. Human QA PASS remains ZERO, and no scenario in this
matrix may be reported as a Human QA pass.**

Seven named gaps closed across this thread: operator reachability · assignment absent · generated
amount ignoring the accepted term · preview ignoring cadence · weekly having no operator cadence ·
rerun counts · recurring discount.

Six probe artifacts are recorded, and two of this thread's findings were corrections of my own
reasoning rather than of the code: a term beginning mid-period is refused rather than billed whole,
and J21's cause was never `materializeCurrentFinancialConsequences` — I had looked at the wrong
authority and reported a gap that did not exist. Both are recorded where the wrong answer was
written, not only where the right one was found.
