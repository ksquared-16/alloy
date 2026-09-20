---
owner: modules
status: canonical
last_reviewed: 2026-09-20
supersedes: []
---

# Payments V1 · W3 — Collection Completion

**Status:** implemented and certified.

W1 gave an organisation a merchant. W2 gave a payer a stored method. W3 closes the loop between them
and the money: which instrument an attempt used, when the provider expects it to land, and what
happens when the provider takes money that Alloy never records.

---

## 1. The spine is unchanged

    collection intent → payment attempt → provider execution → canonical Payment → allocation

**The attempt is not money. Provider success is not automatically money.** Recognition remains owned
by `postProviderConfirmedCollection`, and W3 adds no second collection engine, attempt table, receipt
table, allocation path or reconciliation store.

## 2. Two nullable columns, and nothing else

    payment_collection_attempts.payment_method_id       provenance
    payment_collection_attempts.expected_settlement_on  projection

`payment_method_id` answers "which card did we charge in March" from canonical data. It is
**historical**: never nulled when the method is later revoked, never repointed to a replacement.

`expected_settlement_on` is **not** `received_at`, `effective_at`, `posted_at`, settlement truth or an
accounting-period authority. **No financial calculation reads it.** The moment one does, a provider's
estimate has become Alloy's money.

## 3. Provenance is validated server-side

A stored method must belong to the authenticated org, be scoped to the account, match the requested
rail, be usable, and — W3's addition — **be owned by the payer the attempt names**.

Charging Person B's card while recording Person A as the payer is refused. No later correction can
tell the two apart, and delegated use is a real thing the approved domain does not model yet.

This does not touch responsibility. B may own the card, pay with it, and owe nothing.

## 4. Expected settlement comes from the provider

Mapped from Stripe's `latest_charge.balance_transaction.available_on` — "the date the transaction's
net funds become available". A card charge normally has none, and **null is a correct answer, not a
missing one**. An operator reads `Processing · Expected Sep 24`; they never read `Received` until
canonical recognition has happened.

While the attempt is nonterminal the projection may be revised. Once the Payment exists, its own
canonical dates are authoritative and the projection stops being interesting.

## 5. A bank payment is refunded in full or not at all

Refused at **eligibility**, before the provider is called. The rail comes from the original attempt —
canonical provenance — and deliberately not from `payments.payment_method`, which is operator-entered
text on manual rails.

The sentence is Alloy's: *"A bank payment can only be refunded in full."* Not *"Stripe doesn't support
partial ACH refunds"*, which sends an operator to argue with a company they have no relationship with.
A provider limitation becomes product behaviour at the adapter boundary.

Full bank refunds continue through the existing canonical refund path. Card partial refunds are
untouched.

## 6. Recognition

The gap has existed since Thread 8: `processor_state = 'succeeded'` with `canonical_payment_id` still
null — money the provider took that Alloy never recorded. The database has indexed it all along.
Nothing showed it to anybody.

**`payment.recognize`** (`fin.write`) re-invokes the one canonical recognition boundary. It cannot
create a Payment directly, write an allocation, invent provider success, override provider state, or
rewrite amount, payer or responsibility.

It verifies settlement **against the provider**, not against Alloy's cached `processor_state` — a
stale or tampered local row must not be able to mint a receipt.

It is idempotent. An attempt already recognised returns its existing receipt; a caller who loses the
race is handed the winner's.

**Refusals are not hidden.** The row stays in the queue carrying an operator-safe sentence, and
provider evidence is never mutated to make recognition succeed.

## 7. Where an operator meets it

**Financials → Payments → Needs recognition**, a third lens beside Unapplied and Received. Not a
Reconciliation workspace: it is the same subject — money in — at an earlier stage, and a separate
workspace would invite every future provider-event browser to move in.

Rows carry business meaning, not provider identifiers: amount, rail, account, payer, when the
provider collected, expected settlement, safe method display, and the last refusal reason.

In the Focus Panel a collection in progress reads `Visa •••• 4242` and `Processing · Expected Sep 24`,
composed once in `collectionPresentation` from the canonical Payment Method Reference — never
re-fetched from the provider by a component.

## 8. Revocation and merchant replacement

Revoking a method after money moved cannot erase provenance and **cannot block recognition** — the
money already moved. A *new* collection re-evaluates current usability; a recognition retry does not.

An existing attempt never migrates to a new merchant. New collection uses the current method and the
current merchant; the historical attempt keeps its own.

## 9. Access

    read the queue          fin.read
    collect                 fin.write
    recognize               fin.write
    refund                  fin.adjust
    provider configuration  fin.provider

Recognition takes no key of its own. It does not decide where money settles — it completes Alloy's
record of money already settled, which is the authority that collected it.

## 10. Not in W3

No autopay. No held deposits. No provider settlement or bank reconciliation. No new payment
economics.
