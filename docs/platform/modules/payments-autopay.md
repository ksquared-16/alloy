---
owner: modules
status: canonical
last_reviewed: 2026-09-21
supersedes: []
---

# Payments V1 · W5 — Autopay

**Status:** implemented and certified.

The distinction this exists for: **a saved payment method is not consent to charge it.** W2 made an
instrument storable, which says a family can be charged *when they ask*. Autopay says the
organisation may charge it *when they have not asked*. Those are different permissions, so enrolling
writes a row in a new authority rather than setting a flag on `payment_methods`.

## What the scheduler owns, and what Payments owns

W5 was blocked until Governed Scheduled Work V1 existed, because the platform had no clock at all.
It now has exactly one, and the boundary is the point of the whole design:

| The generic scheduler owns | Payments owns |
|---|---|
| time, the occurrence, claim/lease | the authorization and who gave it |
| dispatch to a registered handler | the payer, the method, the merchant |
| infrastructure retry and recovery | what is currently collectible |
| the execution outcome record | the ceiling, the timing, the payment retry policy |

`scheduled_work` carries a cadence and an **opaque** `domain_ref` holding one thing: the arrangement
id. It would not recognise a due date if it saw one. Everything the handler acts on it re-reads, so
nothing it acts on can be stale.

The handler key is `payments.autopay.evaluate`, registered at the same boundary the scheduler
workstream certified. W5 replaced the body of that placeholder and **nothing above it changed** —
which was the scheduler's own prediction, and is now the evidence for it.

## The arrangement holds consent, not a balance

`payment_autopay_arrangements` records one payer's standing authorization for one account: payer,
method, effective period, amount policy, optional ceiling, timing. It holds **no money figure except
the ceiling**.

An `amount_to_collect` column here would be a second balance, free to disagree with the first the
moment an operator records a cheque — and the family would be charged for money they had already
paid. The amount is resolved from Financials at execution time, every time.

Three guarantees are enforced by the database, and each was exercised against real rows before the
migration was committed:

1. **One live arrangement per account.** V1's only amount policy is `amount_due`, so two live
   arrangements would each resolve the same collectible and each collect it.
2. **Consent terms are immutable.** Changing the payer or the method means a different person
   authorized a different instrument; editing in place would destroy the record of what was agreed.
   Revoke and re-authorize.
3. **Revocation is terminal.** A withdrawn authorization is never reactivated. Restarting is a new
   row with its own `authorized_at`, and the original stays readable exactly as it was given.

## Execution, and the final admission

A scheduled occurrence is **not permission to charge**. Immediately before collection the handler
re-resolves, in this order: the arrangement, the effective period, the method, the merchant, the
retry admission, and — last of all — the current collectible.

Reading the collectible last is deliberate. An operator recording a cheque an hour earlier lands on
`nothing_due` and no card is touched.

If the amount due exceeds the authorized maximum, **nothing is collected**. Not the maximum: that
would be Alloy inventing a payment plan the payer never agreed to. The operator sees the reason.

Collection itself is an **ordinary W3 collection attempt** — same writer, same provider path, same
recognition, same allocation, same refund semantics. There is no Autopay-specific anything.

## A domain refusal is a successful run

The contract's most easily mistaken rule. Nothing due, over the ceiling, paused, a dead card — each
is the handler working correctly and returns `completed`.

Returning `retryable_failure` for any of them would hand a **money** decision to the generic runtime
to retry on infrastructure cadence — sixty seconds later, against the same declined card — and would
fill the operator's failure surface with healthy days until nobody read it.

Payment retry is Payments' own, bounded three independent ways: **two retries**, a **40-day** outer
window, and **three business days** between ACH re-presentments. Each bound exists because dropping
it produces a specific harm: hammering an account, charging a family who left months ago, and return
fees on money that had not had time to settle.

## Method and mandate invalidation

W3 established that an ACH return invalidates the mandate and the canonical method stops being
usable. W5 **converges** on that rather than restating it: a method becoming unusable — by operator
removal or by provider signal — fails every live arrangement standing on it.

There is deliberately **no fallback to another instrument**. The payer authorized one.

## Actions and access

Exactly four, all on `fin.write`, because setting up Autopay is payment-method administration and
that is what `fin.write` already means. There is no `fin.autopay`.

| Action | Effect |
|---|---|
| `autopay.enroll` | records the authorization and registers the schedule |
| `autopay.pause` | no new collection; in-flight money continues on provider truth |
| `autopay.resume` | rechecks the method; **no catch-up** for missed periods |
| `autopay.revoke` | terminal; stops the clock immediately |

There is deliberately **no `autopay.collect`**. An operator who wants to take money today already
has the ordinary collection path; a second execution route would skip the occurrence identity that
makes collection idempotent.

Pause is not a deferral. Resuming invents no retrospective charges, because that would be a term the
payer never agreed to.

## Surface

Autopay administration sits in Focus Panel → Financials → Details, **directly below the stored
methods**, because the question it answers is the one an operator asks next: the card is on file,
does it get charged by itself? Keeping them apart would let the surface imply that storing a card is
consent.

It states the Autopay state, the payer, the safe method display, the **live** amount due, the
timing, any ceiling, the last attempt and any attention reason. It uses the established Financials
card grammar, spacing and type scale, with Bend Pine on the primary act and no provider chrome
anywhere — Stripe is how the money moves, not what the operator is using.

The compact summary is one of: `Autopay on`, `Autopay paused`, `Autopay needs attention`,
`No Autopay`. "Needs attention" is narrow on purpose — only states an operator can act on. A paused
arrangement is a decision somebody made, not a problem.

`resolvePaymentSetup` reads the canonical arrangement. Its previous `unsupported` constant is gone
rather than edited: *"no table, no column and no writer"* was truthful when written, and "no
Autopay" now means no row rather than no implementation.

## What Autopay never does

- Recompute tuition, billing frequency, billing period, discounts, responsibility or accounting
  period. It consumes the canonical collectible.
- Rewrite responsibility. **Responsibility is who owes; payer is who pays.** Settlement never
  changes the first.
- Touch held money. W4 remains authoritative: available prepaid, held money and the deposit business
  lifecycle stay distinct, and Autopay owns none of those economics.

## Related

- [Payments V1 · W2 — Payment Method Reference](payments-payment-method-reference.md)
- [Payments V1 · W3 — Collection Completion](payments-collection-completion.md)
- [Payments V1 · W4 — Held Deposits](payments-held-deposits.md)
