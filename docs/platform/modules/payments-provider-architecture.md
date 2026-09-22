---
owner: modules
status: canonical
last_reviewed: 2026-09-20
supersedes: []
---

# Payments — the provider boundary, and Stripe as Provider V1

**Status:** Payments V1 · W1 (Provider Installation) implemented and certified. Stored payment
methods followed in **W2** and are now implemented — see
[payments-payment-method-reference.md](payments-payment-method-reference.md); this document does not
describe them. Autopay, held deposits and settlement reconciliation are later workstreams and are
still **not** implemented.

**Purpose:** say what Alloy owns, what a payment provider owns, and exactly where the line is — so a
later lane extends the adapter instead of growing a second payments domain beside it.

Read `core-payments-contract.md` first. This document adds only the provider tier.

---

## 1. Three tiers, and the middle one is the point

```
ALLOY PAYMENTS DOMAIN     Provider Merchant · Provider Readiness · Rail Readiness
   provider-neutral       payments · payment_allocations · collection attempts
        ▲
        │ translation only
PAYMENT PROVIDER ADAPTER  account creation · onboarding links · capability → readiness
   lib/financials/payments/providerAccount.ts · stripeWebhook.ts
        ▲
        │ HTTP, signed webhooks
STRIPE                    Provider V1
```

The adapter may call the provider, map its vocabulary onto Alloy's, verify signatures and store raw
evidence. It may **not** write `payments`, `payment_allocations` or the journal, decide what is
owed, decide who owes it, or let a provider status string reach a domain column.

---

## 2. The Provider Merchant IS the association

**Owner:** `payment_provider_merchants`, unchanged by W1. There is no `provider_installations`,
no `stripe_accounts`, no second readiness table. Provider installation and merchant association are
**one concept**: the same organisation, the same processor, the same lifecycle. Two rows that are
always created and withdrawn together are one row.

| Fact | Column |
|---|---|
| which organisation | `org_id` — always from the authenticated session, never a payload |
| which provider | `processor` — a column, not the table's name |
| which external account | `provider_account_ref` (`acct_…`) — an identifier, never a secret |
| can it charge at all | `readiness` ∈ `not_connected` · `onboarding_incomplete` · `restricted` · `ready` |
| can it take bank debit | `ach_readiness`, same vocabulary, `NULL` = nobody has asked |
| when we last asked | `readiness_checked_at` |
| why, when it needs attention | `readiness_detail` |
| withdrawn, not deleted | `is_active` |

**No location-specific merchant in V1.** One active merchant per (org, processor) is a unique index.
The extension point is explicit and unbuilt: add `location_id` to that index and to resolution the
day an organisation genuinely settles two sites to two bank accounts.

**Withdraw and re-add is the only lifecycle the database permits.** `provider_account_ref`,
`processor` and `org_id` are immutable by trigger, so an association is never repointed — which is
what makes "who took this money in March" answerable in June.

---

## 3. Stripe as Provider V1

| Decision | Value | Consequence |
|---|---|---|
| account model | **Accounts v2**, `configuration.merchant` | the account surface Stripe steers new platforms to |
| dashboard | `full` | the provider keeps a real relationship with Stripe |
| responsibilities | `fees_collector: stripe`, `losses_collector: stripe` | Stripe collects its fees from the merchant and carries payment losses |
| onboarding | **Stripe-hosted**, single-use Account Links | Stripe collects KYC/KYB; **Alloy stores none of it** |
| collection | **direct charges** on the connected account | unchanged from Thread 8B/8C, still certified |
| merchant of record | **the childcare provider** | their name on the family's statement |
| funds settle | the provider's Stripe balance → their own bank | Alloy never holds provider funds |
| application fee | **none** | Alloy sells software, not payment processing |

**Why this configuration and not another.** An Express- or Custom-equivalent account puts negative
balances and fraud liability on the PLATFORM; destination charges make Alloy the merchant of record
for tuition. Both would move a childcare provider's risk onto Alloy for no revenue, and the second
is a different regulated business than the one Alloy is in.

### The two compatibilities this rests on

1. **A v2 account id is accepted at v1 Accounts endpoints, and answers in the v1 shape.** So
   readiness is read with `GET /v1/accounts/{id}` and mapped by `readinessFromStripeAccount` /
   `achReadinessFromStripeAccount` — already certified in Thread 8C — and there is no second mapper.
2. **A v2 account's id is an `acct_…`.** So the certified collection path still creates
   PaymentIntents with `Stripe-Account` and needed no change at all.

### One rail, two provider names

Accounts v2 calls the bank rail `ach_debit_payments`; the v1 Account shape reports the same
capability as `us_bank_account_ach_payments`. Measured against the real provider: requesting the v1
name in a v2 create is refused outright. The **request** uses the v2 name, the **read** uses the v1
name, and Alloy's own vocabulary — `ach_readiness` — is neither. That translation lives in
`providerAccount.ts` and nowhere else.

---

## 4. Readiness has exactly one write authority

Four paths converge on `persistReadiness` in `providerInstallation.ts`:

| Writer | When |
|---|---|
| `provider.connect` | establishes the association and its truthful initial state |
| `provider.refresh_readiness` | an operator asks, or the return from onboarding does |
| `account.updated` webhook | the provider says a merchant changed |
| collection execution | **reads** live provider state before accepting money; it does not write |

No route and no component writes readiness. A second writer would be a second answer to "can this
organisation take money", and the laxer of the two would eventually decide whether a family is
charged.

**Returning from onboarding is not proof.** The operator may have clicked *Save for later*. Only the
provider's own account state sets readiness, which is why the return URL refreshes rather than
assumes.

**And a rail needs the merchant before it needs itself** — `railCollectionAvailable` checks
merchant-level readiness first, in the same order the collection path enforces. A merchant that
cannot charge at all offers no rail, whatever its bank capability says.

---

## 5. The two Stripe worlds must not touch

A production Connect endpoint receives **both** live and test deliveries; the event says which it is
and the runtime says which it is by the key it collects with. A disagreement is refused and the
evidence kept.

No environment column was needed: a test account and a live account are different objects with
different ids, so the merchant binding already isolates the two worlds. The check exists to make a
mismatch loud rather than merely improbable.

---

## 6. Access

`fin.provider`, **admin only by default**, minted by
`20260920120000_payments_provider_installation_authority.sql`.

Not `fin.write`: that key is held by `ops`, the role that records cheques and collects cards all day.
Connecting a provider does not take money — it decides whose bank account money lands in, for the
whole organisation. The platform drew this same distinction once before when it minted `fin.post`
rather than widening `fin.write`, and the database encodes it too in the merchant immutability
trigger.

| Act | Permission |
|---|---|
| connect · refresh readiness · disconnect | `fin.provider` |
| see whether the organisation can accept payments | `fin.read` |
| take a payment with an already-configured provider | `fin.write` |
| refund | `fin.adjust` |

Enforced server-side in every registered action. Hiding the chapter is not authorization, and the
certification proves direct invocation is refused.

---

## 7. The operator surface

`/organization/financials` → **Payments**, beside Tuition, Catalog, Policies and Accounting. Not a
standalone Payments product: taking money is the fourth layer of the same financial lifecycle those
chapters configure.

The chapter answers three questions in the order an operator asks them — *can we accept payments*,
*what can we accept*, *does something need attention* — and offers only controls that map to an
action the caller may actually execute.

Operator language, with the provider's vocabulary deliberately absent:

| Operator sees | Never |
|---|---|
| Connect payment provider · Continue setup | create a connected account · Account Link |
| Card payments · Bank payments | `card_payments` · `us_bank_account_ach_payments` |
| Ready · Setup in progress · Needs attention | `charges_enabled` · `requirements.past_due` |
| Refresh status · Disconnect | retrieve Account · `is_active = false` |

The account reference appears once, quietly, because it is genuinely useful when somebody is on the
phone to support. It is never the product model.

---

## 8. Disconnect

Withdraws the association from **future** collection. It does not delete the provider's Stripe
account (it is theirs), the merchant row, the payments it collected, the attempts, the provider
evidence, or the account reference on any historical row. Reconnecting creates a new active row and
leaves the old one exactly as it was.

---

## 9. Not implemented by W1

Autopay, held deposits, provider settlement reconciliation and bank reconciliation.

Stored payment methods were also on this list and **have since been built by W2**: `payment_methods`
is the canonical replacement, and `customer_payment_methods` — the legacy table this section pointed
at — was dropped once a census of the deployed database found it held no rows at all. Nothing in W1
ever read or wrote it.
