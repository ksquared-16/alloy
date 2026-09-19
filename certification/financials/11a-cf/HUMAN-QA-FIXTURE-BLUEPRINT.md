---
title: Thread 11A — Human-QA fixture blueprint
status: sprint
---

# What the governed reseed must rebuild

Three kinds of thing, and only the first should survive a ledger reset.

## A · Baseline identities — preserve

| | |
|---|---|
| Household | `Certhouse Family` (`29944d3e-8267-45b7-8dcb-7405060e2573`) |
| Children | `Certa Certhouse` (`e408fa51…`), `Certb Certhouse` (`46105cd4…`) |
| Agreements | Certa `4e3aa47e…`, Certb `6f409c2d…` |
| A zero-activity household | needed for the zero-prepaid and empty-account scenarios (`Kurzman Family` serves today) |

## B · Commercial configuration — REBUILD after the reset

This is configuration, not history. Human QA cannot exercise these without it.

| Item | State today | Canonical authority |
|---|---|---|
| Due-date policies (`on_invoice` from Sep 18; `days_after_invoice 10` from Sep 19) | **EXISTS** | `financial_policies` · policies chapter |
| `Sibling discount (QA specimen)` | **EXISTS** | `commercial_policies` · New Policy |
| Responsibility arrangements (household + child grain) | **EXISTS** | `billing.configure_responsibility` |
| GL codes and charge-category mapping | **EXISTS** | accounting chapter |
| Catalog charge types | **EXISTS** | catalog chapter |
| **Weekly billing frequency** | **MISSING** | Tuition → Billing Frequencies |
| **Weekly authored tuition rate** | **MISSING** | tuition plan rates |
| **Weekly accepted pricing terms** | **MISSING** | `enrollment.pricing.accept` |
| **Monthly accepted pricing terms** | **MISSING** | `enrollment.pricing.accept` |

Without the last four, `billing.generate_tuition` answers `Generate 0 · $0.00` for every period and
recurring billing cannot be tested at all.

## C · Financial starting state — do NOT preserve

Every charge, reduction, reversal, allocation and responsibility allocation created across Thread
11A's certification is residue. The QA catalog should create the transactions it intends to inspect,
against a clean ledger. Recorded in full in `11a-batchA/FIXTURES.md`.

Note the account currently sits at **Balance −$37.13** with **$125.00 available prepaid** after this
run's allocation — a certification state, not a QA starting state.

## D · Payment / prepaid setup

| Need | Now or later |
|---|---|
| One posted receipt with unapplied money | **NOW** — the only way to exercise available prepaid and allocation |
| A pending/unavailable receipt | **LATER (Payments)** — Core has no operator-reachable provider lifecycle, which is why the rule is certified deterministically instead |
| Payment methods, autopay, provider, deposits | **LATER (Payments)** |

## E · Reachability findings to carry

**`RECURRING_TERMS_OPERATOR_REACHABILITY_GAP`** — `AssignmentTuitionCard` owns acceptance of
recurring tuition terms and renders on card key `billing_preview`. That key IS in
`ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS`, so the card is not missing from the product — the tenant's
**published layout does not place it**, and it is therefore absent from the enrolled-children Focus
Panel this thread has worked on throughout. An ordinary operator on this tenant cannot currently
establish or change a child's recurring tuition terms from the Focus Panel.

Deciding whether to republish the layout is a product decision about Kelly's approved composition,
not a certification fix, so this run did not make it.


---

# Addendum — after v161 (candidate `b93e3cf8d`)

## F · CONFIGURATION TO REBUILD — corrected

The earlier reading of this section was wrong in two places, and the corrections matter because they
change what the reseed has to build.

| Item | Earlier belief | Measured now | Reseed action |
|---|---|---|---|
| **Weekly billing frequency** | must be created | **already exists** — cadence `Weekly`, Active, 1 plan using, persists across a fresh load | **PRESERVE / re-create.** Do not add a second Weekly |
| **Weekly tuition rate** | must be authored | **already authored** — 5 active `private_pay` weekly rates, $200–$250, effective 2026-07-22 | **PRESERVE / re-create** one unambiguous weekly rate on the fixture's variant |
| **Published Focus Panel layout** | v160 placed the card | v160 placed it in `sections` only; **v161** places it in `metadata.focusPanelLayout` too | **REBUILD at v161 shape** — both projections, or the card does not render |
| **The assignment (OCM row)** | assumed present | **absent** — the family has no `opportunity_customer_members` row; both children are `unlinked:` | **BUILD. This is the missing piece.** |
| Due Date policies | as recorded above | unchanged | rebuild |
| Discount policy | as recorded above | unchanged | rebuild |
| Responsibility arrangements | as recorded above | unchanged | rebuild |
| Subject-grain configuration | as recorded above | unchanged | rebuild |

### The v161 placement, exactly

```
metadata.focusPanelLayout.grid.areas += { card: "billing_preview", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 }
metadata.focusPanelLayout.rows       += { cells: [{ width: "full", cards: ["billing_preview"] }] }
```

A section alone is not a placement. Since `85966ffdb` a publication that carries one without the
other is **refused** rather than silently drawn short, so a reseed that rebuilds only `sections` now
fails loudly instead of reproducing this thread's multi-run investigation.

### A hazard to settle while rebuilding

Variant `e1b5e8e5…` carries two active weekly rates — $250.00 effective 2026-07-22 and $100.00 with
**no** `effective_start`. Two applicable options on one variant resolve as **ambiguous**. Author one.

## G · CERTIFICATION TRANSACTION RESIDUE TO REMOVE

Unchanged from §C above, plus this run added **none** — no charges, payments, allocations,
arrangements or pricing terms were written. The only writes were one append-only layout publication
(v161) and source commits.

## H · Reachability findings — updated

**`RECURRING_TERMS_OPERATOR_REACHABILITY_GAP` — narrowed, not closed.** The published layout now
places the card, it mounts once on the enrolled child with its own body, it does not serialize the
panel (first card commit 17 ms; pricing read 6331 → 6549 ms), and it resolves the family opportunity
from a child-grain subject. What has *not* been exercised is acceptance itself.

**`RECURRING_TERMS_ASSIGNMENT_ABSENT` — new, and the whole remaining block.** Acceptance writes an
effective-dated `enrollment_pricing_terms` row against an assignment. This family has none, and no
Focus Panel control creates one. Until the fixture carries an assignment for at least two children,
§7 of the mounted matrix cannot close and `billing.generate_tuition` will keep answering
`Generate 0 · $0.00` — correctly.

---

# Addendum 2 — after the recurring fixture (candidate `0e2887ebf`)

## I · CONFIGURATION TO REBUILD AFTER FINAL RESEED — now with the exact authorities

Everything below was built this run through registered routes. No table was written directly.

| Item | Authority | Identity |
|---|---|---|
| v161-equivalent Focus Panel publication | `POST /api/admin/entity-layouts` + `/{id}/publish` | both projections; a sections-only publish is now REFUSED |
| Child A assignment (OCM) | `POST /api/admin/opportunity-customer-members` | idempotent on (org, opportunity, child) |
| Child B assignment (OCM) | same | same |
| Participation facts | `PATCH /api/admin/opportunity-customer-members/{id}` | **site FIRST** — the placement guard refuses program-without-site |
| Enrolment agreements | `POST /api/admin/child-enrollment-agreements` | required, or the term carries no agreement and generation refuses `assignment_not_enrolled` |
| Weekly billing frequency | already present — do not create a second | cadence `Weekly`, Active |
| ONE unambiguous weekly rate | `POST /api/admin/commercial/tuition-rates` | $185.00 on a **no-quantity** variant, so exactly one option resolves |
| Monthly rate | same | $1,450.00 on a no-quantity variant, dated EARLIER than the day-variant rates so nothing existing changes price |
| Weekly accepted terms | `enrollment.pricing.accept`, **through the mounted card** | one option, `recommended`, no override needed |
| Monthly accepted terms | same | same |
| **Tuition charge template** | `POST /api/admin/financial/charge-templates` | **`rate_derived`, not `fixed`** — see below |
| Due Date policies · discount policy · responsibility arrangements · subject-grain config | as recorded above | unchanged |

### The two rules that make the pricing resolve at all

1. **A no-quantity variant, and no stated days-per-week.** `resolveAssignmentPricingOptions` keeps
   one survivor PER CADENCE and calls two survivors ambiguous, and `acceptEnrollmentPricingTerm`
   refuses anything that is not `recommended`. Every infant/full_time variant in this catalog carries
   both a weekly and a monthly rate, so an assignment there can only ever be OVERRIDDEN. A
   no-quantity variant carrying exactly one rate is the shape that accepts cleanly.
2. **Enrol before pricing, or re-accept after.** The agreement is stamped onto the term at accept
   time. Since `811c544d9` a term accepted first can learn its agreement on a later accept; before
   that commit it never could.

### The template, and why the fixture must set it

`resolveChargeFromTemplate.resolveAmount` returns the TEMPLATE's `amount_cents` when
`amount_strategy === "fixed"`, ignoring the accepted term's price. This tenant's `tuition` template
is `fixed` at **$400.00** and all five templates are `fixed`, so every generated tuition charge bills
$400.00 whatever was agreed.

**The reseed must author the tuition template as `rate_derived`.** Whether the product should also
refuse a fixed template over an accepted term is `RECURRING_GENERATED_AMOUNT_IGNORES_ACCEPTED_TERM`,
recorded in the Section 7 matrix and not decided here.

## J · CERTIFICATION RESIDUE TO REMOVE

Everything in §C above, plus this run's:

- **6 generated tuition drafts** — 1 × Certb September 2026 and 5 × Certa September 2026, all at the
  wrong $400.00, all `Draft · awaiting posting`
- **2 accepted pricing terms** — `19baf6ca…` (weekly) and `2a23f980…` (monthly)
- **2 enrolment agreements** — `43ef5615…`, `fa3767f8…`
- **2 OCM assignment rows** — `79f8011d…`, `cf044308…`

The **configuration** created this run is NOT residue and should be rebuilt: the two authored rates,
and the v161 layout.

## K · Findings carried forward

`RECURRING_GENERATED_AMOUNT_IGNORES_ACCEPTED_TERM` · `RECURRING_PREVIEW_IGNORES_CADENCE` ·
`WEEKLY_RUN_HAS_NO_OPERATOR_CADENCE` · `RERUN_COUNT_DOES_NOT_DISTINGUISH_EXISTING`

`RECURRING_TERMS_OPERATOR_REACHABILITY_GAP` and `RECURRING_TERMS_ASSIGNMENT_ABSENT` are **CLOSED**.

---

# Addendum 3 — recurring correctness (candidate `e98ff76de`)

## L · KEEP / REBUILD — corrected again

| Item | Note |
|---|---|
| v161 valid Focus Panel layout | both projections, or the card does not render |
| Two OCM assignments + two enrolment agreements | agreement BEFORE pricing, or re-accept after |
| Weekly billing frequency | already present |
| Weekly rate $185.00 · Monthly rate $1,450.00 | on **no-quantity** variants, so each resolves to exactly one option |
| Accepted weekly + monthly terms | accepted through the mounted card |
| **Due Date policy effective before the period bills** | the terms in place began 2026-09-18 while September invoices on 2026-09-01. A policy authored effective **2026-08-01, net 10, org-wide** is what makes Invoice → Due resolve |
| **Tuition charge template** | **may stay `fixed`.** It no longer decides the price — an accepted term outranks it. Leaving it fixed is now a legitimate configuration, and the fixture should keep it that way precisely because it proves the precedence |
| Responsibility arrangements · subject-grain configuration | unchanged |
| Recurring discount specimen | **cannot yet be built** — see below |

The earlier addendum told the reseed to author the template as `rate_derived`. That instruction is
**withdrawn**: it would have made this tenant pass while leaving every other tenant able to bill a
number nobody agreed to. The platform holds the precedence now.

## M · REMOVE / RESET

- the six recurring tuition drafts — now 5 × $185.00 (Certa) and 1 × $1,450.00 (Certb), all Draft
- the certification reductions, reversals and prepaid allocations recorded in §C and §J
- the two accepted terms, two agreements and two OCM rows, if the reseed rebuilds them

The **configuration** created across these runs is not residue: the two authored rates, the net-10
due-date policy, and the v161 layout.

## N · The one thing the blueprint cannot yet contain

`RECURRING_DISCOUNT_NOT_APPLIED_BY_GENERATION`. The sibling discount policy is real and active, and
`materializeCurrentFinancialConsequences` handles only `vacation_credit`, so no authored commercial
discount reaches a generated tuition obligation. Until that is wired, a Human-QA scenario that says
"a sibling discount reduces this month's tuition" cannot be built honestly.

---

# Addendum 4 — recurring commercial discounts (candidate `80b55b25a`)

## O · The discount configuration actually used

| Item | Value | Note |
|---|---|---|
| Policy | **Sibling discount (QA specimen)** `5df9fc6c` | already authored; nothing new was created |
| Kind | `sibling_discount` | |
| Basis | percentage, **10** | |
| `applies_to` | `all` | every discountable category |
| Effective | from **2026-01-01**, open-ended | in force across the billed period |
| Eligibility | sibling rank ≥ 2 in a household with ≥ 2 concurrently enrolled children | read server-side, never asserted by a caller |

This policy is exactly what the Human-QA fixture wants represented, and it needed no distortion to
apply: Certa and Certb are two concurrently enrolled children of one household, which is what a
sibling discount is for.

## P · How the discount reaches a recurring obligation

It is a **separate operator act**, and deliberately so:

1. `billing.generate_tuition` — cadence + period → gross obligations at the accepted price
2. `billing.apply_discounts` — period → reductions against whatever gross that period holds

The reseed does not need to wire anything: running (2) after (1) for the same period is the whole
integration. Nothing about recurring generation is special-cased, and the same policy behaves
identically over a manually added tuition charge.

**The preview of (2) now states the money** — "N obligations would be reduced by $X" — rather than
listing policies. A QA scenario may rely on that figure.

## Q · KEEP / REBUILD — final list

* v161 Focus Panel layout (both projections)
* two OCM assignments + two enrolment agreements
* Weekly billing frequency · Weekly $185.00 rate · Monthly $1,450.00 rate (no-quantity variants)
* accepted Weekly and Monthly terms, accepted through the mounted card
* Due Date policy effective **before** the period it bills (net 10, from 2026-08-01)
* **the sibling discount policy above**
* the tuition charge template may stay `fixed` — the platform holds the price precedence
* responsibility arrangements · subject-grain configuration

## R · REMOVE / RESET

* the six generated tuition drafts (5 × $185.00, 1 × $1,450.00)
* **the six reduction drafts and their `financial_reduction_applications` rows**
* the earlier certification reductions, reversals and prepaid allocations
* the accepted terms, agreements and OCM rows, if the reseed rebuilds them

Nothing in §N of the previous addendum stands: `RECURRING_DISCOUNT_NOT_APPLIED_BY_GENERATION` was
never real. A Human-QA scenario saying "a sibling discount reduces this month's tuition" **can** be
built, and is now proven mounted: Gross $185.00 → Discount −$18.50 → Net $166.50, provenance
"10% of $185.00 · Ongoing".

---

# Addendum 5 — FINAL, at the Core freeze (candidate to be reconciled)

Kelly intends to build **Payments before the integrated Financials Human QA**. The fixture must
therefore survive that gap: **one destructive rebuild, not two.** So the blueprint is now split
three ways rather than two.

## S · CORE COMMERCIAL CONFIGURATION TO REBUILD

Durable. Rebuild once, and leave standing through the Payments program.

| Item | Detail |
|---|---|
| v161-shape Focus Panel layout | both projections — a `sections` entry alone is not a placement, and publication now refuses the contradiction |
| Two child assignments (OCM) + two enrolment agreements | agreement before pricing, or re-accept after |
| Weekly billing frequency | present already |
| Weekly authored rate | $185.00 on a **no-quantity** variant |
| Monthly authored rate | $1,450.00 on a no-quantity variant, dated earlier than the day-variant rates |
| Accepted Weekly terms | through the mounted Tuition card |
| Accepted Monthly terms | through the mounted Tuition card |
| Due Date policy | **effective before the period it bills** — net 10 from 2026-08-01 |
| Recurring discount policy | the sibling discount, 10%, `applies_to: all`, effective 2026-01-01 |
| Discount eligibility configuration | two concurrently enrolled children of one household |
| Tuition charge template | may stay **`fixed`** — the platform holds the price precedence, and a fixed template is the better fixture because it proves it |
| Responsibility arrangements · subject-grain configuration | as recorded in §C |

## T · CORE CERTIFICATION TRANSACTION RESIDUE TO REMOVE

Transaction history written purely for engineering proof. None of it is configuration.

- the six generated tuition drafts (5 × $185.00 Certa, 1 × $1,450.00 Certb)
- the six reduction drafts and their `financial_reduction_applications` rows
- the earlier certification reductions, reversals, adjustments and prepaid allocations (§C, §J)
- the accepted terms, agreements and OCM rows **only if** the reseed rebuilds them from §S

## U · PAYMENTS CONFIGURATION TO BE ADDED LATER

Not built, not reseeded, and listed so the eventual integrated fixture is planned once:

- provider connection (Stripe, Provider V1) and merchant account association
- payment methods on file for at least one payer
- an autopay enrolment
- a held deposit, so the deposit lifecycle has a specimen
- a failed and a returned payment, so the provider paths are exercisable
- a provider reconciliation linkage

## V · The sequencing rule

The Core configuration in §S is **not** to be torn down when Payments lands. The integrated
Human-QA fixture is §S **plus** §U, with §T removed once. A reseed that rebuilds §S a second time
because Payments arrived is the second destructive cycle this split exists to avoid.
