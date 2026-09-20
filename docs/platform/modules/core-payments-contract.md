---
owner: modules
status: canonical
last_reviewed: 2026-09-20
supersedes: []
---

# Core Financials → Payments — the contract

**Status:** written at the Thread 11A **Core freeze**. Core Financials feature work is complete and
mounted-certified; Payments is the next program and this document is its boundary.

**Purpose:** say exactly what Payments inherits, what it must not rebuild, and where
provider-specific objects belong — so the next lane extends a foundation instead of growing a second
financial domain beside it.

Read `financials-canonical-authorities.md` first. This document adds only the boundary.

---

## 1. The rule

> **Payments EXTENDS Core. Payments does not re-implement Core.**

The failure mode here is not ignorance, it is a plausible local decision. A provider integration
that needs "a balance" is one `select` away from computing its own, and that second balance will be
right for a week and wrong forever after. Every item below already has an owner.

**Payments MUST NOT create a parallel:**

| Concept | The one owner |
|---|---|
| Balance / position | the canonical account reader — `resolveFinancialPosition` and the account VM |
| Ledger | `charges` + `financial_journal_entries` |
| Payer truth | `payments.payer_*` — the person who actually supplied the money |
| Responsibility | `financial_responsibility_arrangements` + `_shares` |
| Payment allocation | `payment_allocations` |
| Prepaid authority | unapplied POSTED payment — there is no wallet table |
| GL truth | `gl_accounts` + the GL mapping configuration |
| Account identity | `customers` / the financial account the readers already resolve |
| Charge writing | `writeTemplateDraftCharge` / `createChildcareDraftCharge` via registered actions |
| Reductions | `applyFinancialReductions` |

A provider-specific object is an **integration record**. It is not a financial fact, and it must not
become one by being read as a balance, a payment, or an allocation.

---

## 2. What Payments inherits — the Core primitives, already proven

These exist, are certified, and are what Payments builds on. Do not re-derive them.

- **Financial account** — the household's account identity and its canonical read
- **Payer identity** — who supplied money, recorded on the payment and never rewritten by an
  application moving
- **Payment** — a canonical receipt with its own lifecycle, independent of any provider
- **Payment allocation** — what a receipt was applied to; moving an allocation changes applications,
  not payment identity
- **Unapplied money** — received and not yet applied; three distinct figures (received, applied,
  unapplied) plus refunded
- **Available prepaid** — only canonically AVAILABLE money is offered. Pending, processing,
  requires-action, failed, voided and unknown are all excluded, and the rule fails toward
  do-not-offer
- **Ledger and GL** — concepts, categories, dates, periods and accounts
- **Responsibility** — who owes, entirely separate from who paid

**Two invariants Payments must not break:**

1. **Payment settlement must not rewrite responsibility.** Settling an obligation with somebody
   else's money moves no part of who owes it.
2. **Available prepaid must not be netted into Current Balance.** They are two figures answering two
   questions, and a balance that already includes held money tells an operator a family owes less
   than they do.

---

## 3. The layering Payments joins

From `financials-canonical-authorities.md` §0:

```
ACCEPTED COMMERCIAL TERM   →  GROSS OBLIGATION
COMMERCIAL REDUCTION POLICY →  REDUCTIONS → NET OBLIGATION
RESPONSIBILITY              →  WHO OWES IT
PAYMENT / ALLOCATION        →  HOW MONEY SETTLES IT     ← Payments extends HERE
```

Payments is the fourth layer and only the fourth layer. A Payments feature that changes what is
owed, who owes it, or what it is for has reached into a layer it does not own.

---

## 4. The provider architecture boundary

Three tiers, and the middle one is the whole point.

### ALLOY PAYMENTS DOMAIN — canonical, provider-neutral

Owns, in Alloy's own vocabulary:

- provider installation association (which provider this organisation uses)
- merchant / payment account association
- payer
- payment method **reference** (a durable handle, not a card) — implemented in W2 as
  `payment_methods`; see [payments-payment-method-reference.md](payments-payment-method-reference.md)
- collection intent / request
- payment attempt — carries method provenance and an expected-settlement projection since W3; see
  [payments-collection-completion.md](payments-collection-completion.md)
- payment
- allocation
- refund / return
- autopay enrolment
- provider reconciliation linkage

These are Alloy concepts. They are named, shaped and versioned by Alloy, and they would survive the
organisation changing provider.

### PAYMENT PROVIDER ADAPTER — translation, and nothing else

Owns translation to and from a provider's APIs, objects and events. It maps provider vocabulary onto
the domain above and back. It holds no financial truth of its own: a webhook is an input, not a
ledger entry, and reconciliation is a comparison between the domain and the provider, not a second
source of the domain.

### STRIPE — Provider V1

Stripe will be the first adapter. **Do not design Core around Stripe-specific objects.** No
`payment_intent`, `charge`, `setup_intent`, `customer` or `payment_method` shape belongs in the
canonical domain, in the ledger, or on an operator surface. The architecture must allow a second
provider without rewriting the Financials ledger or any operator surface.

**The test to apply to any new table or field:** *would this still be the right name and shape if the
organisation moved to a different provider tomorrow?* If not, it belongs in the adapter.

---

## 5. Organization configuration boundary

Payments should ultimately extend **`/organization/financials`** — the configuration surface that
already owns tuition plans, billing frequencies, the catalog, policies, the accounting calendar and
GL. Payments configuration belongs beside those, not in a second settings area.

Expected future chapters, **not implemented in Core**:

- ~~Connect provider (Stripe)~~ — **IMPLEMENTED by Payments V1 · W1**
- ~~merchant / account connection status~~ — **W1**
- ~~provider capabilities~~ — **W1**, as card and bank readiness
- ~~ACH and card configuration~~ — **W1**, as rail readiness
- ~~provider health~~ — **W1**
- payment methods enabled — W2
- autopay configuration — W5
- deposit configuration — W4

Core established the boundary; W1 built the chapter. `/organization/financials` → **Payments** now
owns connecting a provider, its card and bank readiness, refreshing that state and disconnecting.
See **`payments-provider-architecture.md`** for the provider tier and the Stripe V1 adapter.

Everything W1 did NOT build is still unbuilt, and the product says so rather than implying otherwise:
stored payment methods, autopay, held deposits and settlement reconciliation.

---

## 6. What Payments closes that Core deliberately left open

Three Core deferrals are recorded in the Director QA catalog (`CORE_DEFERRALS`). Two of the three are
Payments work:

- **`DEPOSIT_OPERATOR_PRODUCTIZATION_GAP`** — the deposit policy type and model foundation exist and
  are configurable. Taking, holding, applying and releasing a held deposit is Payments.
- **`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED`** — fixed shares are operator-authorable today;
  percentage and remainder are enforced in the arrangement authority with no authoring surface.
  Whether this lands with Payments or later is a product decision, not a technical one.

The third, `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED`, is a Core surface question and is not
Payments work.

Four Director QA scenarios are classified `PAYMENTS_PHASE` and are the acceptance this program owes:
`card_collection`, `ach_processing`, `provider_return`, `refund`.

---

## 7. Human acceptance

Core Financials is **mounted-certified and not humanly accepted**. That is deliberate: Kelly's
acceptance is of the integrated Financials V1 product, which includes Payments. The Director QA
catalog therefore stands at **Human PASS ZERO**, with 40 `CORE_RUNNABLE` scenarios waiting and 4
`PAYMENTS_PHASE` scenarios that cannot yet be driven.

**Do not read "certified" as "accepted".** They are different words for different acts, and the
catalog exists to keep them apart.
