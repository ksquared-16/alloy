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
