# Payment setup and the payer model

**Status:** census complete; non-provider model productized (Thread 11A Repair Pass 3).
**Owners:** Core Financials. Provider execution remains Thread 8B/8C.

---

## 1. Six concepts that must not collapse

| Concept | Question it answers | Canonical owner |
|---|---|---|
| **Responsibility** | Who is financially responsible for an obligation? | `responsibility/arrangementService`, surfaced as `vm.responsibility.parties` |
| **Payer** | Who actually supplied money? | `payments.payer_entity_type` / `payer_entity_id` |
| **Payment method** | How can a payer supply it? | `payments.payment_method` for what was used; `customer_payment_methods` for what is stored |
| **Autopay** | What authorises a method to be used automatically? | **Nothing. Does not exist.** |
| **Payment** | Money received from an actual payer | `payments` |
| **Application** | How received money settles obligations | `payment_allocations` |

A household may have several responsible adults, several potential payers, **a payer who is
responsible for nothing** — a grandparent settling a bill — several methods, and more than one
autopay arrangement. **Moving an application never changes who actually paid.**

The card's `vm.payers` field means *responsibility*, and correctly so. It is not a payer chooser,
and using it as one is the collapse this document exists to prevent.

---

## 2. Census — what already existed

Run before any schema was considered. The conclusion was that **the model was already canonical and
the UI was not using it**.

### Canonical, and in use

| Thing | Where | Note |
|---|---|---|
| Payment received | `payments` | Org-scoped; addressed by childcare billable source. `job_id` and `customer_id` are both nullable now. |
| **Actual payer** | `payments.payer_entity_type` / `payer_entity_id` | Paired-null CHECK. Written since Thread 6. `payment.record` has always accepted it. |
| Payment method | `payments.payment_method` NOT NULL | `cash`, `check`, `money_order`, `ach`, `card`, `manual`, `other`. Cash/cheque/money order need no provider. |
| Lifecycle | `status`, `direction`, `received_at`, `effective_at`, `posted_at`, `failed_at`, `voided_at` | |
| Provenance | `processor`, `processor_transaction_id`, `reference_number`, `created_by` | |
| Application | `payment_allocations` | Reversal and refund paths exist. |
| Provider merchant | `payment_provider_merchants` | `readiness` ∈ {not_connected, onboarding_incomplete, restricted, ready}; `ach_readiness` separately. |
| Provider lifecycle | `payment_collection_attempts`, `payment_provider_events`, `payment_provider_disputes`, `payment_provider_refunds` | |
| Registered actions | `payment.record`, `payment.apply_to_charge`, `payment.reverse_application`, `payment.refund`, `payment.collect_card`, `billing.attribute_payment` | All executable. |

### Genuinely absent

| Thing | State |
|---|---|
| **Payment method on file (non-provider)** | `customer_payment_methods` is Stripe-only: `stripe_payment_method_id NOT NULL`, **no `org_id`**, no payer-person link, household grain only. Not usable as a general payment-method model. |
| **Autopay** | **No table, no column, no writer anywhere.** Appears only in `cardLabFixtures` and the Focus Panel concept catalog. |
| **Payment setup readiness** | `vm.paymentSetup` was a hardcoded `null` with no producer. The card adapter read it as "No payment method on file" *and* as the autopay state. **Two different questions, one answer, and that answer was a constant.** |

---

## 3. What this pass productized

* **`resolvePayerCandidates`** — household membership, ordered by primary contact and then by name.
  Explicitly **not** ordered by responsibility: ordering the chooser by who owes the money is how an
  operator records the responsible party as the payer without noticing. Ended and inactive
  relationships are excluded. `alsoResponsible` is *reported* on each candidate and never used to
  order, filter or default the choice.
* **`resolvePaymentSetup`** — per-capability state derived from the org's merchant and the
  household's stored methods.
* **The payer chooser on Record payment** — `payment.record` already accepted
  `payer_entity_type` / `payer_entity_id`; the operator simply had no way to say. "Not stated" stays
  a legitimate answer: an unsigned cheque is better recorded as unattributed than as a guess.
* **Autopay reported as `unsupported`,** with the reason, instead of `Not recorded` — which implied
  somebody could have recorded it and had not, making a claim about the family rather than about
  Alloy.

### The five capability states

`unsupported` and `not_configured` are **different answers** and the distinction is the point: an
operator can act on the second and can only be told about the first.

| State | Meaning |
|---|---|
| `unsupported` | Alloy has no implementation to offer. |
| `not_configured` | Alloy has one; this organisation has not set it up. |
| `pending` | Set up, not yet usable (provider onboarding incomplete). |
| `available` | Usable now. |
| `failed` | Configured and refused by the provider (restricted merchant). |

Current answers with no merchant connected: Record payment `available`; card and bank debit
`not_configured`; manage methods and autopay `unsupported`.

---

## 4. Record payment vs Take payment

These are different operations and must never share a name.

| | **Record payment** | **Take payment** |
|---|---|---|
| What it does | Writes down money that already arrived | Asks a provider to collect money |
| Rails | cash, cheque, money order, manual, other | card, ACH |
| Needs a provider | **No** | Yes |
| Truth at write time | `status = 'posted'` is financial truth | Nothing is money until provider-confirmed success reaches Thread 8 |
| Available today | **Yes**, on any tenant | Only with a ready merchant |

Sending a bank debit down the record path would write a receipt for money no bank has moved — the
same defect card collection had, on a rail where settlement takes days, so the lie would last
longer.

---

## 5. Manage payment — what it means, and why it is not offered

Scope, if it existed: view payment setup; add / remove / replace payment methods; choose a default;
configure autopay; show provider readiness.

**Every write in that list requires provider tokenisation**, because Alloy never handles card
details. With no test-mode merchant on this tenant there is nothing to tokenise against, so
`manageMethods` is `unsupported` and **no control is offered**. A control that opens onto nothing is
worse than an absent one: it tells an operator a capability exists.

The *readable* half — what this organisation can and cannot do, and why — is surfaced in the
Payments lens of the account workspace, where money in is the subject.

---

## 6. The autopay model — designed, deliberately not migrated

Autopay must not be a boolean on the household. The smallest canonical model needs its own row:

```
payment_autopay_arrangements
  id                  uuid pk
  org_id              uuid not null            -- tenant scope, which customer_payment_methods lacks
  customer_id         uuid not null            -- SCOPE: the account it pays for
  payer_entity_type   text not null            -- WHO authorised it ('person')
  payer_entity_id     uuid not null            -- paired-null, exactly as payments does it
  payment_method_id   uuid not null            -- WHICH method; provider-backed today
  status              text not null            -- active | paused | revoked | failed
  authorized_by       uuid                     -- PROVENANCE: who recorded the authorisation
  authorized_at       timestamptz not null
  authorization_ref   text                     -- the provider mandate id, where one exists
  effective_from      date not null            -- EFFECTIVE STATE, not merely "on"
  effective_to        date
  revoked_at          timestamptz
  metadata            jsonb not null default '{}'
```

It carries all six things the Director required: payer, method, scope, status, authorisation
provenance, and an effective state that is a date range rather than a flag.

**It was not created in this pass, and that is a decision rather than an omission.** Every write to
it needs a tokenised payment method, which needs a provider, which is deferred. Shipping the table
now would add an empty relation with no writer and no reader — schema without truth — and the
honest state today is the one the product already reports: autopay is `unsupported`, because it does
not exist. The table lands with tokenisation, not before it.

---

## 7. The provider boundary

Deferred until approved test-mode merchant infrastructure exists:

* card collection execution;
* ACH initiation and settlement;
* provider returns and disputes;
* payment-method tokenisation, and therefore autopay enrolment.

What is **not** deferred, and must never be: recording cash, cheque and money order; naming the
actual payer; applying, reversing and refunding; and telling the truth about which of the above this
organisation can currently do.

**No hardcoded null may be read as a business fact.** That is the rule this pass was written to
restore, and `resolvePaymentSetup` exists so there is one place that can break it.
