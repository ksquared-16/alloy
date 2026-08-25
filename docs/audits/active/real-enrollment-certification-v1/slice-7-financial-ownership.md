# §1 — What owns money in Alloy, and what may never become a field

Answered from repository evidence: 357 migrations, 263 tables, and the payment code path.

## 1. What owns ACH / payment authorization today?

**Stripe does, and Alloy holds a reference.** `customer_payment_methods` has exactly five meaningful
columns: `customer_id`, `stripe_payment_method_id`, `brand`, `last4`, `is_default`. Setup runs
through a Stripe SetupIntent (`lib/book-v2/persistBookingPaymentMethod.ts`): the client collects the
credential, the provider returns `pm_…`, and Alloy stores that token plus the brand and last four
digits for display.

## 2. Is there a canonical destination for these?

| Value | Canonical destination |
|---|---|
| Routing number | **None. Must never exist.** |
| Bank account number | **None. Must never exist.** |
| Account holder name | None — the person exists, but "who owns the bank account" is not a person attribute Alloy models |
| Financial institution | None |
| Account type (checking/savings) | None |

Searched for `routing_number`, `account_number`, `bank_account` across the whole tree: **zero
matches** outside Stripe token names. No table, no column, no field definition. The absence is the
design, and this slice does not disturb it.

## 3. What may exist transiently but must NOT become Field System values?

Everything in the table above. The raw credential is collected **by the provider's client**, not by
Alloy, so it is transient in the browser and never in transit to Alloy at all. Account holder name,
institution and account type are setup inputs the provider needs; Alloy's copy would be a second,
staler answer to a question the provider already owns.

## 4. Does an authorization artifact remain evidence separately?

**Yes, and it already does.** The ACH Authorization is one of the four logical artifacts segmented
out of the hosted form, and it carries its own signature requirement. `documents` holds the signed
artifact with `checksum_sha256` and versions. The authorization is evidence that permission was
granted; `customer_payment_methods` is the mechanism it authorized. Those are different facts and
they stay in different places.

## 5. What is safe to retain after tokenization?

`stripe_payment_method_id`, `brand`, `last4`, `is_default` — which is exactly what is retained today.
Nothing this packet asks for changes that.

## What the packet asked for, and where each answer went

| Packet question | Routed to | Why |
|---|---|---|
| Routing number | `FINANCIAL_PAYMENT` | a protected credential with no destination, and none may be created |
| Account number | `FINANCIAL_PAYMENT` | same |
| Financial Institution | `FINANCIAL_PAYMENT` | payment-method setup input, owned by the provider |
| Select Account Type | `FINANCIAL_PAYMENT` | same |
| Account Holder Full Name | `FINANCIAL_PAYMENT` | same — and note it was previously proposed as `person.name`, which would have written the account holder onto a family member's record |
| Non-Refundable Annual Material Fee | `FINANCIAL_PAYMENT` | **billing configuration**, owned by `childcare_rate_plans`. It is what the school charges, not a fact about this child; a copy on the child would drift from the school's own number the first time the fee changed |

**No banking store was invented.** Six concepts are collected on the form, none becomes an Alloy
field, and each says which of the four different reasons applies — credential, setup input, billing
configuration, or evidence.
