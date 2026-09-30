---
owner: payments
status: evidence
last_reviewed: 2026-09-30
supersedes: none
---

# W6-B — deployed mounted certification

Measured against the deployed staging build, signed in as the registered QA identity. Source guards
cannot prove reachability; every count below is taken from the rendered DOM.

**Build** `d3ca831f4026d7b72cdba3c536a52679304b8b80`, read from `/api/build-info` — the merge of
PR #1339.

## Route

`/adminV2/financials` redirects to `/workspace`. Financials is the Focus Panel card on a case, and
Details is reached through `[data-financials-nav="details"]` — **not** an element labelled "Payment
Details", which is how the text reads but not how it is built. Recorded because the label and the
selector disagree, so a walkthrough written from the visible text does not work.

## What the deployed build renders

| Marker | Count | Reading |
| --- | --- | --- |
| `[data-financials-detail="true"]` | 1 | the Details surface renders |
| `[data-financials-command="deposit.hold"]` | **1** | the Hold control is MOUNTED and reachable |
| `[data-financials-holdable]` | `12500` | $125.00 holdable |
| `[data-testid="available-prepaid"]` | 1 | $125.00 |
| `[data-financials-command="payment.refund"]` | 5 | one per receipt |
| `[data-testid="held-funds"]` | 0 | nothing held — zero stays silent |
| `[data-financials-held-deposits="true"]` | 0 | no lots, so no position section |

`holdable` is `12500` and Available prepaid is `$125.00`. They agree exactly, which is the bound
`unapplied − held` being derived rather than guessed.

**The Hold control being present is the W4 defect closed.** `deposit.hold` had been registered and
executable since W4 with no mounted caller, so no hold could be created on a real account, and the
position, its provenance and every act on it were unreachable however correct they were.

## Scope item 8 — the payer name reaches the stored-method surface

Through `[data-financials-manage-payments="open"]`:

> PAYMENT METHODS — Add card · visa •••• 4242 · Expires 12/31 · Default · Remove
> 1 removed method is kept for payment history.
> AUTOPAY — Autopay on · **Payer: Certt Certhouse** · Method visa •••• 4242 · Timing: collects on
> the due date

The payer is NAMED. That is the repair: the production mount passed `customerId` alone, so the
billing-name prefill the component implements never received a name and silently did nothing.

## What is NOT certified on deployed, and why

The held POSITION with its lots — provenance, Apply, Release, Refund — cannot render until a hold
exists, and the only account here carrying money state is Certhouse, whose W5 history must be
preserved. `payment_holds` is an immutable append-only lot, so holding and then releasing would
leave both dispositions on Certhouse's record permanently: that is mutating W5 certification
evidence, not borrowing it.

Those acts are certified on the certification stack instead, against the same schema the deployed
primary now carries — censused by catalog rather than trusted from the apply's own label:

* apply — 6 live cases, including the concurrency case that separates the repair from the two-write
  defect, plant-verified;
* refund — 5 live cases, including the non-refundable refusal executing nothing, and the replayed
  recognition being refused by the partial unique index rather than by the bounds trigger,
  plant-verified.

Closing this gap needs a controlled deployed fixture — a household on staging that is not Certhouse.
None exists, and the lane cannot seed one.
